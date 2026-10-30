import { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { BrandLoadingOverlay } from "../components/brand-loading-overlay";
import { Brand, StatusBadge } from "../components/brand";
import { useAuth } from "../auth/auth-context";
import { getApiUrl } from "../config/api";

type Gateway = {
  id: number;
  name: string;
  managementIpAddress: string;
  status: "online" | "offline";
  wanIpAddress: string | null;
};

type Pagination = { total: number; currentPage: number; lastPage: number };
type NetworkSummary = { total: number; online: number; offline: number };

export default function GatewaysScreen() {
  const { token, user, logout, apiFetch, isRestoring } = useAuth();
  const activeRequest = useRef<AbortController | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "online" | "offline">("all");
  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<Pagination>({
    total: 0,
    currentPage: 1,
    lastPage: 1,
  });
  const [summary, setSummary] = useState<NetworkSummary>({
    total: 0,
    online: 0,
    offline: 0,
  });
  const [listRequest, setListRequest] = useState({
    page: 1,
    q: "",
    status: "all",
  });

  useEffect(() => {
    const timeout = setTimeout(() => {
      setListRequest((current) =>
        current.q === query.trim() && current.status === filter
          ? current
          : { page: 1, q: query.trim(), status: filter },
      );
    }, 300);
    return () => clearTimeout(timeout);
  }, [query, filter]);

  const loadGateways = useCallback(async () => {
    if (isRestoring) return;

    if (!token) {
      router.replace("/login");
      return;
    }

    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        page: String(listRequest.page),
        limit: "20",
      });
      if (listRequest.q) params.set("q", listRequest.q);
      if (listRequest.status !== "all")
        params.set("status", listRequest.status);
      const response = await apiFetch(`${getApiUrl()}/gateways?${params}`, {
        signal: controller.signal,
      });
      const body = await response.json().catch(() => null);

      if (controller.signal.aborted) return;

      if (!response.ok) {
        throw new Error(
          body?.errors?.[0]?.message ??
            "Não foi possível carregar os gateways.",
        );
      }

      if (!body?.meta || !body?.summary || !Array.isArray(body.gatewaysList)) {
        throw new Error("Resposta inválida ao carregar os gateways.");
      }
      if (listRequest.page > body.meta.lastPage) {
        setListRequest((current) => ({ ...current, page: body.meta.lastPage }));
        return;
      }
      setGateways(body.gatewaysList);
      setPagination(body.meta);
      setSummary(body.summary);
    } catch (loadError) {
      if (controller.signal.aborted) return;
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Não foi possível carregar os gateways.",
      );
    } finally {
      if (activeRequest.current === controller) {
        activeRequest.current = null;
        setLoading(false);
      }
    }
  }, [apiFetch, isRestoring, token, listRequest]);

  useEffect(() => {
    void Promise.resolve().then(loadGateways);
    return () => activeRequest.current?.abort();
  }, [loadGateways]);

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  const online = summary.online;
  const changingFilters =
    query.trim() !== listRequest.q || filter !== listRequest.status;
  return (
    <SafeAreaView
      className="flex-1 bg-brand-blueDark"
      edges={["top", "bottom"]}
    >
      <View className="bg-brand-blueDark px-5 pb-7 pt-4 md:px-8">
        <View className="w-full max-w-5xl self-center">
          <View className="flex-row items-center justify-between gap-3">
            <Brand />
            <Pressable
              accessibilityRole="button"
              className="min-h-12 flex-row items-center gap-2 rounded-full border border-white/25 px-4 active:bg-white/10"
              onPress={() => void handleLogout()}
            >
              <Text className="text-xs font-bold tracking-[1px] text-white">
                SAIR
              </Text>
            </Pressable>
          </View>
          <Text className="mt-7 text-[10px] font-bold tracking-[1.8px] text-[#8fb0b8]">
            INVENTÁRIO DA REDE
          </Text>
          <Text
            accessibilityRole="header"
            className="mt-2 text-[32px] font-bold leading-9 tracking-tight text-white md:text-4xl"
          >
            Gateways
          </Text>
          <Text className="mt-2 text-sm leading-5 text-[#c4d5d8]">
            Olá, {user?.fullName?.split(" ")[0] ?? "usuário"}. Estado da rede e
            acesso à configuração.
          </Text>
          <View className="mt-5 flex-row items-center border-t border-white/15 pt-4">
            <View className="flex-row items-end gap-2">
              <Text className="text-[28px] font-bold leading-8 text-white">
                {String(summary.total).padStart(2, "0")}
              </Text>
              <Text className="pb-1 text-[10px] font-bold tracking-[1.2px] text-[#c4d5d8]">
                GATEWAYS
              </Text>
            </View>
            <View className="mx-5 h-8 w-px bg-white/20" />
            <View className="flex-row items-center gap-4">
              <View className="flex-row items-center gap-2">
                <View
                  className={`h-2 w-2 rounded-full ${online > 0 ? "bg-brand-green" : "bg-slate-400"}`}
                />
                <Text
                  className={`text-xs font-semibold ${online > 0 ? "text-[#d6e7e5]" : "text-[#b9ced5]"}`}
                >
                  {online} online
                </Text>
              </View>
              <Text className="text-xs font-semibold text-[#b9ced5]">
                {summary.offline} offline
              </Text>
            </View>
          </View>
          {user?.isAdmin ? (
            <View className="mt-5 flex-row gap-3">
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push("/gateways/new")}
                className="min-h-12 flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-white px-4 active:bg-brand-blueLight"
              >
                <Text className="text-lg font-normal text-brand-blue">+</Text>
                <Text className="text-xs font-bold tracking-[0.5px] text-brand-blueDark">
                  NOVO GATEWAY
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push("/users/new")}
                className="min-h-12 flex-1 flex-row items-center justify-center gap-2 rounded-xl border border-white/35 px-4 active:bg-white/10"
              >
                <Text className="text-lg font-normal text-white">+</Text>
                <Text className="text-xs font-bold tracking-[0.5px] text-white">
                  NOVO USUÁRIO
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </View>
      <FlatList
        className="flex-1 bg-canvas"
        contentContainerClassName="w-full max-w-5xl self-center flex-grow px-5 py-6 pb-10 md:py-8"
        data={gateways}
        keyExtractor={(gateway) => String(gateway.id)}
        ListHeaderComponent={
          <View>
            <View className="mb-5 flex-row items-center justify-between gap-3 border-b border-[#cddbd5] pb-3">
              <Text className="flex-1 text-[10px] font-bold tracking-[1.2px] text-slate-500">
                {loading && !gateways.length
                  ? "LENDO A REDE…"
                  : `${gateways.length} DE ${pagination.total} EQUIPAMENTOS`}
              </Text>
              <Pressable
                accessibilityRole="button"
                disabled={loading}
                accessibilityLabel="Atualizar gateways"
                onPress={() => void loadGateways()}
                className="min-h-12 justify-center rounded-xl px-3 active:bg-brand-blueLight"
              >
                <Text className="text-[10px] font-bold tracking-[1px] text-brand-blue">
                  ATUALIZAR
                </Text>
              </Pressable>
            </View>
            <View className="mb-5 gap-3 md:flex-row md:items-center md:justify-between">
              <Text className="text-[10px] font-bold tracking-[1.4px] text-slate-500 md:hidden">
                LOCALIZAR EQUIPAMENTO
              </Text>
              <View className="flex-row items-center rounded-xl border border-slate-300 bg-white px-4 md:max-w-md md:flex-1">
                <TextInput
                  accessibilityLabel="Buscar gateways por nome ou IP"
                  value={query}
                  onChangeText={setQuery}
                  maxLength={200}
                  placeholder="Buscar por nome ou endereço IP"
                  placeholderTextColor="#64748b"
                  className="min-h-12 flex-1 text-sm text-slate-900"
                />
              </View>
              <View className="flex-row self-start border-b border-[#cddbd5] bg-canvas py-1">
                {(
                  [
                    { value: "all", label: "Todos" },
                    { value: "online", label: "Online" },
                    { value: "offline", label: "Offline" },
                  ] as const
                ).map((option) => (
                  <Pressable
                    key={option.value}
                    accessibilityRole="button"
                    accessibilityState={{ selected: filter === option.value }}
                    onPress={() => setFilter(option.value)}
                    className={`min-h-11 justify-center border-b-2 px-4 ${filter === option.value ? "border-brand-blue" : "border-transparent"}`}
                  >
                    <Text
                      className={`text-xs font-bold tracking-[0.5px] ${filter === option.value ? "text-brand-blueDark" : "text-slate-500"}`}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <View className="mb-1 flex-row items-center justify-between">
              <Text className="text-[10px] font-bold tracking-[1.4px] text-slate-500">
                NÓS DA REDE
              </Text>
              <Text className="text-xs text-slate-600">
                {pagination.total}{" "}
                {pagination.total === 1 ? "resultado" : "resultados"}
              </Text>
            </View>
            {error ? (
              <View className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4">
                <Text
                  accessibilityRole="alert"
                  className="text-sm leading-5 text-red-800"
                >
                  {error}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void loadGateways()}
                  className="mt-2 min-h-12 justify-center"
                >
                  <Text className="text-sm font-bold text-red-800">
                    Tentar novamente
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          !loading && !error ? (
            <View className="items-start border-l-2 border-brand-blue px-5 py-8">
              <Text className="text-xl font-bold text-brand-blueDark">
                {query || filter !== "all"
                  ? "Nenhum resultado encontrado"
                  : "Nenhum gateway cadastrado"}
              </Text>
              <Text className="mt-2 text-left text-sm leading-6 text-slate-600">
                {query || filter !== "all"
                  ? "Tente outro nome, endereço IP ou filtro."
                  : "Os gateways cadastrados aparecerão nesta lista."}
              </Text>
            </View>
          ) : undefined
        }
        refreshControl={
          <RefreshControl
            tintColor="transparent"
            colors={["transparent"]}
            refreshing={false}
            onRefresh={() => void loadGateways()}
          />
        }
        ListFooterComponent={
          pagination.lastPage > 1 ? (
            <View className="mt-5 flex-row items-center justify-between gap-3 border-t border-[#cddbd5] pt-4">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Página anterior de gateways"
                accessibilityState={{
                  disabled:
                    loading || changingFilters || pagination.currentPage <= 1,
                }}
                disabled={
                  loading || changingFilters || pagination.currentPage <= 1
                }
                onPress={() =>
                  setListRequest((current) => ({
                    ...current,
                    page: pagination.currentPage - 1,
                  }))
                }
                className={`min-h-12 justify-center rounded-lg px-3 ${pagination.currentPage <= 1 || loading || changingFilters ? "opacity-40" : "bg-white"}`}
              >
                <Text className="text-sm font-bold text-brand-blueDark">
                  Anterior
                </Text>
              </Pressable>
              <Text
                accessibilityLiveRegion="polite"
                className="text-xs text-slate-600"
              >
                Página {pagination.currentPage} de {pagination.lastPage}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Próxima página de gateways"
                accessibilityState={{
                  disabled:
                    loading ||
                    changingFilters ||
                    pagination.currentPage >= pagination.lastPage,
                }}
                disabled={
                  loading ||
                  changingFilters ||
                  pagination.currentPage >= pagination.lastPage
                }
                onPress={() =>
                  setListRequest((current) => ({
                    ...current,
                    page: pagination.currentPage + 1,
                  }))
                }
                className={`min-h-12 justify-center rounded-lg px-3 ${pagination.currentPage >= pagination.lastPage || loading || changingFilters ? "opacity-40" : "bg-white"}`}
              >
                <Text className="text-sm font-bold text-brand-blueDark">
                  Próxima
                </Text>
              </Pressable>
            </View>
          ) : undefined
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Abrir gateway ${item.name}, ${item.status}`}
            className="flex-row gap-3 py-1 active:bg-brand-blueLight"
            onPress={() =>
              router.push({
                pathname: "/gateways/[id]",
                params: { id: String(item.id) },
              })
            }
          >
            <View className="w-5 items-center pt-2">
              <View
                className={`h-3 w-3 rounded-full border-2 bg-canvas ${item.status === "online" ? "border-brand-green" : "border-slate-400"}`}
              />
              <View className="mt-1 min-h-12 w-px flex-1 bg-[#cddbd5]" />
            </View>

            <View className="flex-1 border-b border-[#cddbd5] pb-5 pt-1">
              <View className="flex-row items-start justify-between gap-3">
                <View className="flex-1">
                  <Text className="text-[9px] font-bold tracking-[1.4px] text-slate-500">
                    BROWAN PICO NEXT / {String(item.id).padStart(3, "0")}
                  </Text>
                  <Text className="mt-1.5 text-lg font-bold leading-6 text-brand-blueDark">
                    {item.name}
                  </Text>
                </View>
                <StatusBadge online={item.status === "online"} />
              </View>

              <View className="mt-4 flex-row gap-4">
                <View className="min-w-0 flex-1 border-l border-[#b9c9c5] pl-3">
                  <Text className="text-[9px] font-bold tracking-[1px] text-slate-500">
                    IP DE GERENCIAMENTO
                  </Text>
                  <Text
                    numberOfLines={1}
                    className="mt-1 text-sm font-semibold text-slate-800"
                  >
                    {item.managementIpAddress}
                  </Text>
                </View>
                <View className="min-w-0 flex-1 border-l border-[#b9c9c5] pl-3">
                  <Text className="text-[9px] font-bold tracking-[1px] text-slate-500">
                    ENDEREÇO WAN
                  </Text>
                  <Text
                    numberOfLines={1}
                    className="mt-1 text-sm font-semibold text-slate-800"
                  >
                    {item.wanIpAddress ?? "Não observada"}
                  </Text>
                </View>
              </View>

              <View className="mt-4 flex-row items-center justify-between">
                <Text className="text-[10px] font-bold tracking-[1.1px] text-brand-blue">
                  ABRIR CONFIGURAÇÃO
                </Text>
                <Text className="text-lg text-brand-blue">→</Text>
              </View>
            </View>
          </Pressable>
        )}
      />
      <BrandLoadingOverlay visible={loading} label="Atualizando gateways" />
    </SafeAreaView>
  );
}
