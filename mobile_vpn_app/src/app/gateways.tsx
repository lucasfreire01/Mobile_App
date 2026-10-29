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

export default function GatewaysScreen() {
  const { token, user, logout, apiFetch, isRestoring } = useAuth();
  const fetching = useRef(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "online" | "offline">("all");
  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadGateways = useCallback(async () => {
    if (isRestoring) return;

    if (!token) {
      router.replace("/login");
      return;
    }

    if (fetching.current) return;
    fetching.current = true;
    setLoading(true);
    setError(null);

    try {
      const response = await apiFetch(`${getApiUrl()}/gateways`);
      const body = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          body?.errors?.[0]?.message ??
            "Não foi possível carregar os gateways.",
        );
      }

      setGateways(body?.gatewaysList ?? []);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Não foi possível carregar os gateways.",
      );
    } finally {
      fetching.current = false;
      setLoading(false);
    }
  }, [apiFetch, isRestoring, token]);

  useEffect(() => {
    void Promise.resolve().then(loadGateways);
  }, [loadGateways]);

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  const online = gateways.filter(
    (gateway) => gateway.status === "online",
  ).length;
  const visibleGateways = gateways.filter(
    (gateway) =>
      (filter === "all" || gateway.status === filter) &&
      `${gateway.name} ${gateway.managementIpAddress} ${gateway.wanIpAddress ?? ""}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
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
                {String(gateways.length).padStart(2, "0")}
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
                {gateways.length - online} offline
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
        data={visibleGateways}
        keyExtractor={(gateway) => String(gateway.id)}
        ListHeaderComponent={
          <View>
            <View className="mb-5 flex-row items-center justify-between gap-3 border-b border-[#cddbd5] pb-3">
              <Text className="flex-1 text-[10px] font-bold tracking-[1.2px] text-slate-500">
                {loading && !gateways.length
                  ? "LENDO A REDE…"
                  : `ATUALIZADO · ${gateways.length} EQUIPAMENTOS`}
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
                {visibleGateways.length}{" "}
                {visibleGateways.length === 1 ? "resultado" : "resultados"}
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
                    BROWAN PICO NEXT  /  {String(item.id).padStart(3, "0")}
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
