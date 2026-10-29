import { useCallback, useEffect, useRef, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../../auth/auth-context";
import { ScreenHeader } from "../../../components/screen-header";
import { BrandLoadingOverlay } from "../../../components/brand-loading-overlay";
import { OperationStatus } from "../../../components/operation-status";
import { getApiUrl } from "../../../config/api";

type NetworkOperation = {
  id: number;
  action: string;
  status: "pending" | "applying" | "applied" | "failed";
  attempts: number;
  errorCode: string | null;
  errorMessage: string | null;
  requestedByEmail: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

type OperationsResponse = {
  operations: NetworkOperation[];
  meta: {
    currentPage: number;
    lastPage: number;
  };
};

function formatDate(value: string | null) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function GatewayOperationsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token, apiFetch, isRestoring } = useAuth();
  const fetching = useRef(false);
  const [operations, setOperations] = useState<NetworkOperation[]>([]);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadOperations = useCallback(
    async (requestedPage = 1, append = false) => {
      if (isRestoring) return;

      if (!token || !id) {
        router.replace("/login");
        return;
      }

      if (fetching.current) return;
      fetching.current = true;
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);

      try {
        const response = await apiFetch(
          `${getApiUrl()}/gateways/${id}/network-operations?page=${requestedPage}&limit=20`,
        );
        const body = (await response
          .json()
          .catch(() => null)) as OperationsResponse | null;

        if (!response.ok || !body) {
          throw new Error(
            "Não foi possível carregar o histórico de operações.",
          );
        }

        setOperations((current) =>
          append ? [...current, ...body.operations] : body.operations,
        );
        setPage(body.meta.currentPage);
        setLastPage(body.meta.lastPage);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Não foi possível carregar o histórico de operações.",
        );
      } finally {
        fetching.current = false;
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [apiFetch, id, isRestoring, token],
  );

  useEffect(() => {
    void Promise.resolve().then(() => loadOperations());
  }, [loadOperations]);

  return (
    <SafeAreaView
      className="flex-1 bg-brand-blueDark"
      edges={["top", "bottom"]}
    >
      <ScreenHeader
        title="Histórico de operações"
        subtitle={`Gateway #${id} / Atividade`}
        onRefresh={() => void loadOperations()}
        refreshing={loading || loadingMore}
      />

      <ScrollView
        className="flex-1 bg-canvas"
        contentContainerClassName="w-full max-w-5xl self-center gap-5 p-5 pb-10"
        refreshControl={
          <RefreshControl
            refreshing={false}
            tintColor="transparent"
            colors={["transparent"]}
            onRefresh={() => void loadOperations()}
          />
        }
      >
        {error ? (
          <Text
            accessibilityRole="alert"
            className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800"
          >
            {error}
          </Text>
        ) : null}

        {!loading && !operations.length && !error ? (
          <Text className="border-l-2 border-brand-blue px-4 py-5 text-slate-600">
            Nenhuma operação registrada para este gateway.
          </Text>
        ) : null}

        {operations.map((operation) => (
          <View className="border-b border-[#cddbd5] py-5" key={operation.id}>
            <View className="flex-row gap-4">
            <View className="w-5 items-center pt-1">
              <View
                className={`h-3 w-3 rounded-full ${operation.status === "applied" ? "bg-brand-green" : operation.status === "failed" ? "bg-red-600" : "bg-amber-500"}`}
              />
              <View className="mt-1 min-h-10 w-px flex-1 bg-[#cddbd5]" />
            </View>
            <View className="flex-1">
              <View className="flex-row items-start justify-between gap-3">
                <View className="flex-1">
                  <Text className="text-[9px] font-bold tracking-[1.4px] text-slate-500">
                    OPERAÇÃO  /  {String(operation.id).padStart(4, "0")}
                  </Text>
                  <Text className="mt-1.5 font-bold text-brand-blueDark">
                    {operation.action}
                  </Text>
                </View>
                <OperationStatus status={operation.status} />
              </View>
              <Text className="mt-2 text-sm text-slate-600">
                Solicitada: {formatDate(operation.createdAt)}
              </Text>
              <View className="mt-4 flex-row flex-wrap gap-x-6 gap-y-2 border-t border-[#dbe3de] pt-3">
                <Text className="text-xs leading-5 text-slate-600">
                  Tentativas: {operation.attempts}
                </Text>
                <Text className="text-xs leading-5 text-slate-600">
                  Iniciada: {formatDate(operation.startedAt)}
                </Text>
                <Text className="text-xs leading-5 text-slate-600">
                  Finalizada: {formatDate(operation.finishedAt)}
                </Text>
                {operation.requestedByEmail ? (
                  <Text className="text-xs leading-5 text-slate-600">
                    Solicitada por: {operation.requestedByEmail}
                  </Text>
                ) : null}
              </View>
            </View>
          </View>
          {operation.errorMessage ? (
              <Text className="mt-3 border-l-2 border-red-600 bg-red-50 px-3 py-2 text-sm leading-5 text-red-800">
                {operation.errorCode ? `${operation.errorCode}: ` : ""}
                {operation.errorMessage}
              </Text>
          ) : null}
          </View>
        ))}

        {page < lastPage ? (
          <Pressable
            accessibilityRole="button"
            className={`min-h-12 items-center justify-center rounded-xl bg-brand-blue ${loadingMore ? "bg-slate-400" : ""}`}
            disabled={loadingMore}
            onPress={() => void loadOperations(page + 1, true)}
          >
            <Text className="font-bold text-white">
              {loadingMore ? "Carregando…" : "Carregar mais"}
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>
      <BrandLoadingOverlay
        visible={loading || loadingMore}
        label="Carregando histórico de operações"
      />
    </SafeAreaView>
  );
}
