import { useCallback, useEffect, useRef, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  Switch,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../auth/auth-context";
import { BrandLoadingOverlay } from "../../components/brand-loading-overlay";
import { ScreenHeader } from "../../components/screen-header";
import { StatusBadge } from "../../components/brand";
import { OperationStatus } from "../../components/operation-status";
import { getApiUrl } from "../../config/api";

type Gateway = {
  id: number;
  name: string;
  managementIpAddress: string;
  status: string;
  wanIpAddress: string | null;
  lastSeenAt: string | null;
};

type EthernetConfig = {
  id: number;
  mode: "dhcp" | "static";
  dhcpFallbackEnabled: boolean;
  staticIpAddress: string | null;
  staticPrefixLength: number | null;
  staticGateway: string | null;
  primaryDns: string | null;
  secondaryDns: string | null;
};

type NetworkOperation = {
  id: number;
  action: string;
  status: "pending" | "applying" | "applied" | "failed";
  attempts: number;
  errorMessage: string | null;
  createdAt: string;
};

type SecurityAlert = {
  id: number;
  type: string;
  status: "open" | "acknowledged";
  message: string;
};

type EthernetDraft = {
  mode: "dhcp" | "static";
  dhcpFallbackEnabled: boolean;
  staticIpAddress: string;
  staticPrefixLength: string;
  staticGateway: string;
  primaryDns: string;
  secondaryDns: string;
};

function toEthernetDraft(config: EthernetConfig): EthernetDraft {
  return {
    mode: config.mode,
    dhcpFallbackEnabled: config.dhcpFallbackEnabled,
    staticIpAddress: config.staticIpAddress ?? "",
    staticPrefixLength: config.staticPrefixLength?.toString() ?? "",
    staticGateway: config.staticGateway ?? "",
    primaryDns: config.primaryDns ?? "",
    secondaryDns: config.secondaryDns ?? "",
  };
}

function formatDate(value: string | null) {
  if (!value) return "Nunca";

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function operationStatusMessage(operation: NetworkOperation) {
  if (operation.status === "pending") {
    return `Operação #${operation.id} aguardando na fila.`;
  }

  if (operation.status === "applying") {
    return `Operação #${operation.id} está sendo aplicada no gateway.`;
  }

  if (operation.status === "applied") {
    return `Operação #${operation.id} aplicada com sucesso.`;
  }

  return `Operação #${operation.id} falhou. Revise o erro abaixo e tente novamente.`;
}

export default function GatewayDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token, apiFetch, isRestoring } = useAuth();
  const fetching = useRef(false);
  const [gateway, setGateway] = useState<Gateway | null>(null);
  const [ethernetConfig, setEthernetConfig] = useState<EthernetConfig | null>(
    null,
  );
  const [ethernetDraft, setEthernetDraft] = useState<EthernetDraft | null>(
    null,
  );
  const [operation, setOperation] = useState<NetworkOperation | null>(null);
  const [alerts, setAlerts] = useState<SecurityAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [acknowledgingAlertId, setAcknowledgingAlertId] = useState<
    number | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const operationInProgress =
    operation?.status === "pending" || operation?.status === "applying";

  const loadGateway = useCallback(
    async (showOverlay = true) => {
      if (isRestoring) return;

      if (!token || !id) {
        router.replace("/login");
        return;
      }

      if (fetching.current) return;
      fetching.current = true;
      if (showOverlay) setLoading(true);
      setError(null);

      try {
        const request = async (path: string) => {
          const response = await apiFetch(`${getApiUrl()}${path}`);
          const body = await response.json().catch(() => null);

          if (!response.ok) {
            throw new Error(
              body?.errors?.[0]?.message ??
                "Não foi possível carregar o gateway.",
            );
          }

          return body;
        };

        const [gatewayBody, ethernetBody, operationsBody, alertsBody] =
          await Promise.all([
            request(`/gateways/${id}`),
            request(`/gateways/${id}/ethernet`),
            request(`/gateways/${id}/network-operations?page=1&limit=1`),
            request(`/gateways/${id}/security-alerts?page=1&limit=20`),
          ]);

        const savedEthernetConfig = ethernetBody.ethernetConfigs?.[0] ?? null;

        setGateway(gatewayBody.gateway);
        setEthernetConfig(savedEthernetConfig);
        setEthernetDraft(
          (currentDraft) =>
            currentDraft ??
            (savedEthernetConfig ? toEthernetDraft(savedEthernetConfig) : null),
        );
        setOperation(operationsBody.operations?.[0] ?? null);
        setAlerts(alertsBody.alerts ?? []);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Não foi possível carregar o gateway.",
        );
      } finally {
        fetching.current = false;
        setLoading(false);
      }
    },
    [apiFetch, id, isRestoring, token],
  );

  useEffect(() => {
    void Promise.resolve().then(() => loadGateway());
  }, [loadGateway]);

  useEffect(() => {
    if (
      error ||
      !operation ||
      !["pending", "applying"].includes(operation.status)
    ) {
      return;
    }

    const interval = setInterval(() => void loadGateway(false), 5_000);
    return () => clearInterval(interval);
  }, [error, loadGateway, operation]);

  async function applyEthernetConfiguration() {
    if (!token || !id || !ethernetConfig) {
      return;
    }

    setApplying(true);
    setError(null);

    try {
      const response = await apiFetch(
        `${getApiUrl()}/gateways/${id}/ethernet/apply`,
        {
          method: "POST",
        },
      );
      const body = await response.json().catch(() => null);

      if (!response.ok || !body?.operation) {
        throw new Error(
          body?.message ??
            body?.errors?.[0]?.message ??
            "Não foi possível aplicar a configuração.",
        );
      }

      setOperation(body.operation);
      await loadGateway();
    } catch (applyError) {
      setError(
        applyError instanceof Error
          ? applyError.message
          : "Não foi possível aplicar a configuração.",
      );
    } finally {
      setApplying(false);
    }
  }

  function updateDraft(field: keyof EthernetDraft, value: string | boolean) {
    setEthernetDraft((currentDraft) =>
      currentDraft ? { ...currentDraft, [field]: value } : currentDraft,
    );
  }

  async function saveEthernetConfiguration() {
    if (!token || !id || !ethernetDraft) {
      return;
    }

    const requiresStaticProfile =
      ethernetDraft.mode === "static" || ethernetDraft.dhcpFallbackEnabled;
    const prefixLength = Number(ethernetDraft.staticPrefixLength);

    if (
      requiresStaticProfile &&
      (!ethernetDraft.staticIpAddress ||
        !ethernetDraft.staticGateway ||
        !ethernetDraft.primaryDns ||
        !Number.isInteger(prefixLength) ||
        prefixLength < 1 ||
        prefixLength > 32)
    ) {
      setError("Informe IP, prefixo entre 1 e 32, gateway e DNS primário.");
      return;
    }

    setSaving(true);
    setError(null);
    setSaveMessage(null);

    try {
      const payload = {
        mode: ethernetDraft.mode,
        dhcpFallbackEnabled: ethernetDraft.dhcpFallbackEnabled,
        ...(ethernetDraft.staticIpAddress
          ? { staticIpAddress: ethernetDraft.staticIpAddress }
          : {}),
        ...(ethernetDraft.staticPrefixLength
          ? { staticPrefixLength: prefixLength }
          : {}),
        ...(ethernetDraft.staticGateway
          ? { staticGateway: ethernetDraft.staticGateway }
          : {}),
        ...(ethernetDraft.primaryDns
          ? { primaryDns: ethernetDraft.primaryDns }
          : {}),
        ...(ethernetDraft.secondaryDns
          ? { secondaryDns: ethernetDraft.secondaryDns }
          : {}),
      };
      const endpoint = ethernetConfig
        ? `/gateways/${id}/ethernet/${ethernetConfig.id}`
        : `/gateways/${id}/ethernet`;
      const response = await apiFetch(`${getApiUrl()}${endpoint}`, {
        method: ethernetConfig ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => null);

      if (!response.ok || !body?.ethernetConfig) {
        throw new Error(
          body?.errors?.[0]?.message ??
            body?.message ??
            "Não foi possível salvar a configuração.",
        );
      }

      setEthernetConfig(body.ethernetConfig);
      setEthernetDraft(toEthernetDraft(body.ethernetConfig));
      setSaveMessage(
        "Configuração salva. Clique em “Aplicar configuração” para enviar ao gateway.",
      );
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Não foi possível salvar a configuração.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function acknowledgeSecurityAlert(alertId: number) {
    if (!token || !id) return;

    setAcknowledgingAlertId(alertId);
    setError(null);

    try {
      const response = await apiFetch(
        `${getApiUrl()}/gateways/${id}/security-alerts/${alertId}/acknowledge`,
        { method: "POST" },
      );
      const body = await response.json().catch(() => null);

      if (!response.ok || !body?.alert) {
        throw new Error(
          body?.errors?.[0]?.message ??
            body?.message ??
            "Não foi possível reconhecer o alerta.",
        );
      }

      setAlerts((currentAlerts) =>
        currentAlerts.map((alert) =>
          alert.id === alertId ? { ...alert, status: "acknowledged" } : alert,
        ),
      );
    } catch (acknowledgeError) {
      setError(
        acknowledgeError instanceof Error
          ? acknowledgeError.message
          : "Não foi possível reconhecer o alerta.",
      );
    } finally {
      setAcknowledgingAlertId(null);
    }
  }

  return (
    <SafeAreaView
      className="flex-1 bg-brand-blueDark"
      edges={["top", "bottom"]}
    >
      <ScreenHeader
        title={gateway?.name ?? "Detalhes do gateway"}
        subtitle="Gateways / Detalhes"
        onRefresh={() => void loadGateway()}
        refreshing={loading}
      />

      <ScrollView
        className="flex-1 bg-canvas"
        contentContainerClassName="w-full max-w-5xl self-center gap-5 p-5 pb-10"
        refreshControl={
          <RefreshControl
            refreshing={false}
            tintColor="transparent"
            colors={["transparent"]}
            onRefresh={() => void loadGateway()}
          />
        }
      >
        {error ? (
          <View className="rounded-xl border border-red-200 bg-red-50 p-4">
            <Text
              accessibilityRole="alert"
              className="text-sm leading-6 text-red-800"
            >
              {error}
            </Text>
          </View>
        ) : null}

        {gateway ? (
          <View className="border-b border-[#cddbd5] bg-canvas py-6 md:py-7">
            <View className="mb-4 flex-row items-center justify-between">
              <Text className="text-lg font-bold text-slate-900">
                Estado atual
              </Text>
              <StatusBadge online={gateway.status === "online"} />
            </View>
            <Text className="text-sm leading-6 text-slate-600">
              Gerenciamento: {gateway.managementIpAddress}
            </Text>
            <Text className="text-sm leading-6 text-slate-600">
              WAN: {gateway.wanIpAddress ?? "Não observada"}
            </Text>
            <Text className="text-sm leading-6 text-slate-600">
              Última vez online: {formatDate(gateway.lastSeenAt)}
            </Text>
          </View>
        ) : null}

        <View className="border-b border-[#cddbd5] bg-canvas py-6 md:py-7">
          <View className="mb-5 border-b border-slate-100 pb-4">
            <Text
              accessibilityRole="header"
              className="mt-1 text-xl font-bold text-slate-900"
            >
              Configuração Ethernet
            </Text>
          </View>
          {ethernetConfig ? (
            <>
              <Text className="text-sm leading-6 text-slate-600">
                Modo: {ethernetConfig.mode.toUpperCase()}
              </Text>
              <Text className="text-sm leading-6 text-slate-600">
                Fallback DHCP:{" "}
                {ethernetConfig.dhcpFallbackEnabled ? "Ativado" : "Desativado"}
              </Text>
              {ethernetConfig.mode === "static" ? (
                <>
                  <Text className="text-sm leading-6 text-slate-600">
                    IP: {ethernetConfig.staticIpAddress}/
                    {ethernetConfig.staticPrefixLength}
                  </Text>
                  <Text className="text-sm leading-6 text-slate-600">
                    Gateway: {ethernetConfig.staticGateway}
                  </Text>
                  <Text className="text-sm leading-6 text-slate-600">
                    DNS: {ethernetConfig.primaryDns ?? "Não configurado"}
                  </Text>
                </>
              ) : null}
            </>
          ) : (
            <Text className="text-sm text-slate-600">
              Nenhuma configuração Ethernet salva.
            </Text>
          )}

          {ethernetDraft ? (
            <View className="mt-5 border-t border-slate-200 pt-5">
              <Text className="mb-2 text-base font-bold text-slate-900">
                Editar configuração
              </Text>
              <Text className="mb-3 text-sm leading-5 text-slate-600">
                Salvar não muda a rede. A alteração só chega ao gateway quando
                você aplicar a configuração.
              </Text>

              <Text className="mb-2 text-sm font-semibold text-slate-700">
                Modo
              </Text>
              <View className="flex-row gap-3">
                {(["dhcp", "static"] as const).map((mode) => (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{
                      selected: ethernetDraft.mode === mode,
                    }}
                    className={`min-h-12 flex-1 justify-center rounded-xl border px-3 py-3 ${ethernetDraft.mode === mode ? "border-brand-blue bg-brand-blueLight" : "border-slate-300 bg-white"}`}
                    key={mode}
                    onPress={() => updateDraft("mode", mode)}
                  >
                    <Text
                      className={`text-center font-semibold uppercase ${ethernetDraft.mode === mode ? "text-brand-blue" : "text-slate-700"}`}
                    >
                      {mode === "dhcp" ? "DHCP automático" : "IP estático"}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {ethernetDraft.mode === "dhcp" ? (
                <View className="mt-4 min-h-12 flex-row items-center justify-between rounded-xl border border-slate-200 p-3">
                  <View className="mr-3 flex-1">
                    <Text className="font-semibold text-slate-800">
                      Fallback DHCP
                    </Text>
                    <Text className="mt-1 text-sm leading-5 text-slate-600">
                      Usa o perfil estático se o DHCP falhar.
                    </Text>
                  </View>
                  <View className="min-h-12 min-w-12 items-center justify-center">
                    <Switch
                      accessibilityLabel="Fallback DHCP"
                      value={ethernetDraft.dhcpFallbackEnabled}
                      onValueChange={(enabled) =>
                        updateDraft("dhcpFallbackEnabled", enabled)
                      }
                      trackColor={{ false: "#94a3b8", true: "#138466" }}
                    />
                  </View>
                </View>
              ) : null}

              {ethernetDraft.mode === "static" ||
              ethernetDraft.dhcpFallbackEnabled ? (
                <View className="mt-4 gap-3">
                  <Text className="text-sm font-semibold text-slate-700">
                    {ethernetDraft.mode === "static"
                      ? "Endereço estático"
                      : "Perfil de recuperação"}
                  </Text>
                  <Text className="mt-2 text-[10px] font-bold tracking-[1px] text-slate-600">
                    Endereço IP
                  </Text>
                  <TextInput
                    className="min-h-12 border-b border-[#b9c9c5] bg-transparent px-0 text-base text-slate-900 focus:border-brand-blue"
                    onChangeText={(value) =>
                      updateDraft("staticIpAddress", value)
                    }
                    placeholder="IP (ex.: 10.42.0.126)"
                    placeholderTextColor="#64748B"
                    accessibilityLabel="Endereço IP estático"
                    autoCapitalize="none"
                    value={ethernetDraft.staticIpAddress}
                  />
                  <Text className="mt-2 text-[10px] font-bold tracking-[1px] text-slate-600">
                    Prefixo de rede
                  </Text>
                  <TextInput
                    className="min-h-12 border-b border-[#b9c9c5] bg-transparent px-0 text-base text-slate-900 focus:border-brand-blue"
                    keyboardType="numeric"
                    onChangeText={(value) =>
                      updateDraft("staticPrefixLength", value)
                    }
                    placeholder="Prefixo (ex.: 24)"
                    placeholderTextColor="#64748B"
                    accessibilityLabel="Prefixo de rede"
                    autoCapitalize="none"
                    value={ethernetDraft.staticPrefixLength}
                  />
                  <Text className="mt-2 text-[10px] font-bold tracking-[1px] text-slate-600">
                    Gateway da rede
                  </Text>
                  <TextInput
                    className="min-h-12 border-b border-[#b9c9c5] bg-transparent px-0 text-base text-slate-900 focus:border-brand-blue"
                    onChangeText={(value) =>
                      updateDraft("staticGateway", value)
                    }
                    placeholder="Gateway (ex.: 10.42.0.1)"
                    placeholderTextColor="#64748B"
                    accessibilityLabel="Gateway da rede"
                    autoCapitalize="none"
                    value={ethernetDraft.staticGateway}
                  />
                  <Text className="mt-2 text-[10px] font-bold tracking-[1px] text-slate-600">
                    DNS primário
                  </Text>
                  <TextInput
                    className="min-h-12 border-b border-[#b9c9c5] bg-transparent px-0 text-base text-slate-900 focus:border-brand-blue"
                    onChangeText={(value) => updateDraft("primaryDns", value)}
                    placeholder="DNS primário"
                    placeholderTextColor="#64748B"
                    accessibilityLabel="DNS primário"
                    autoCapitalize="none"
                    value={ethernetDraft.primaryDns}
                  />
                  <Text className="mt-2 text-[10px] font-bold tracking-[1px] text-slate-600">
                    DNS secundário · opcional
                  </Text>
                  <TextInput
                    className="min-h-12 border-b border-[#b9c9c5] bg-transparent px-0 text-base text-slate-900 focus:border-brand-blue"
                    onChangeText={(value) => updateDraft("secondaryDns", value)}
                    placeholder="DNS secundário (opcional)"
                    placeholderTextColor="#64748B"
                    accessibilityLabel="DNS secundário"
                    autoCapitalize="none"
                    value={ethernetDraft.secondaryDns}
                  />
                </View>
              ) : null}

              <Pressable
                accessibilityRole="button"
                className={`mt-5 min-h-12 items-center justify-center rounded-xl border border-brand-blue bg-white active:bg-brand-blueLight ${saving ? "bg-slate-400" : ""}`}
                disabled={saving}
                onPress={saveEthernetConfiguration}
              >
                <Text className="text-base font-bold text-brand-blue">
                  {saving ? "Salvando…" : "Salvar configuração"}
                </Text>
              </Pressable>
              {saveMessage ? (
                <Text className="mt-3 text-sm leading-5 text-brand-greenDark">
                  {saveMessage}
                </Text>
              ) : null}
            </View>
          ) : null}

          <Pressable
            accessibilityRole="button"
            className={`mt-5 min-h-12 items-center justify-center rounded-xl bg-brand-greenDark active:opacity-85 ${applying || operationInProgress || !ethernetConfig ? "bg-slate-400" : ""}`}
            disabled={applying || operationInProgress || !ethernetConfig}
            onPress={applyEthernetConfiguration}
          >
            <Text className="text-base font-bold text-white">
              {applying
                ? "Enviando…"
                : operationInProgress
                  ? "Configuração em processamento"
                  : "Aplicar configuração"}
            </Text>
          </Pressable>
          {operation ? (
            <Text
              className={`mt-3 text-sm leading-5 ${operation.status === "failed" ? "text-red-700" : operation.status === "applied" ? "text-brand-greenDark" : "text-brand-blue"}`}
            >
              {operationStatusMessage(operation)}
            </Text>
          ) : null}
        </View>

        <View className="border-b border-[#cddbd5] bg-canvas py-6 md:py-7">
          <Text className="mb-3 text-lg font-bold text-slate-900">
            Última operação
          </Text>
          {operation ? (
            <>
              <Text className="text-sm leading-6 text-slate-600">
                Ação: {operation.action}
              </Text>
              <View className="my-2">
                <OperationStatus status={operation.status} />
              </View>
              <Text className="text-sm leading-6 text-slate-600">
                Tentativas: {operation.attempts}
              </Text>
              {operation.errorMessage ? (
                <Text className="mt-2 text-sm text-red-700">
                  {operation.errorMessage}
                </Text>
              ) : null}
            </>
          ) : (
            <Text className="text-sm text-slate-600">
              Nenhuma operação executada.
            </Text>
          )}
          <Pressable
            accessibilityRole="button"
            className="mt-4 min-h-12 self-start justify-center py-2"
            onPress={() => router.push(`/gateways/${id}/operations`)}
          >
            <Text className="font-semibold text-brand-blue">
              Ver histórico de operações
            </Text>
          </Pressable>
        </View>

        <View className="border-b border-[#cddbd5] bg-canvas py-6 md:py-7">
          <Text className="mb-3 text-lg font-bold text-slate-900">
            Alertas de segurança
          </Text>
          {alerts.length ? (
            alerts.map((alert) => (
              <View className="mb-2 rounded-lg bg-red-50 p-3" key={alert.id}>
                <Text className="font-semibold text-red-800">{alert.type}</Text>
                <Text className="mt-1 text-sm text-red-700">
                  {alert.message}
                </Text>
                <View className="mt-2 flex-row items-center justify-between gap-3">
                  <Text className="text-xs font-semibold uppercase text-red-700">
                    {alert.status}
                  </Text>
                  {alert.status === "open" ? (
                    <Pressable
                      accessibilityRole="button"
                      className={`min-h-12 justify-center rounded-lg bg-red-700 px-3 py-2 ${acknowledgingAlertId === alert.id ? "bg-slate-400" : ""}`}
                      disabled={acknowledgingAlertId === alert.id}
                      onPress={() => void acknowledgeSecurityAlert(alert.id)}
                    >
                      <Text className="text-xs font-bold text-white">
                        {acknowledgingAlertId === alert.id
                          ? "Reconhecendo…"
                          : "Reconhecer"}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ))
          ) : (
            <Text className="text-sm text-slate-600">
              Nenhum alerta registrado.
            </Text>
          )}
        </View>
      </ScrollView>
      <BrandLoadingOverlay
        visible={loading || saving || applying || acknowledgingAlertId !== null}
        label={
          saving
            ? "Salvando configuração"
            : applying
              ? "Enviando configuração"
              : acknowledgingAlertId !== null
                ? "Reconhecendo alerta"
                : "Carregando detalhes do gateway"
        }
      />
    </SafeAreaView>
  );
}
