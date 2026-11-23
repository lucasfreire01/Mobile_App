import { useCallback, useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScreenHeader } from "../../components/screen-header";
import { FormField } from "../../components/form-field";
import { useAuth } from "../../auth/auth-context";
import { getApiUrl } from "../../config/api";
import { getApiErrorMessage } from "../../lib/api-error";
import { router, usePreventRemove } from "expo-router";
import * as Network from "expo-network";
import {
  buildLocalBridgeCandidates,
  discoverLocalBridges,
  type LocalBridge,
  type LocalGateway,
} from "../../lib/gateway-discovery";
import { getGatewayPairingLayout } from "../../lib/gateway-pairing-layout";
import { pairGateway, PairingConfirmationPending, type PairingEvent } from "../../lib/gateway-pairing";

export default function NewGatewayScreen() {
  const { apiFetch } = useAuth();
  const [name, setName] = useState("");
  const [managementIpAddress, setManagementIpAddress] = useState("");
  const [gatewayEui, setGatewayEui] = useState("");
  const [location, setLocation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enrollmentCode, setEnrollmentCode] = useState<string | null>(null);
  const [localGateways, setLocalGateways] = useState<LocalGateway[]>([]);
  const [selectedGateway, setSelectedGateway] = useState<LocalGateway | null>(null);
  const [localBridges, setLocalBridges] = useState<LocalBridge[]>([]);
  const [selectedBridge, setSelectedBridge] = useState<LocalBridge | null>(null);
  const [scanning, setScanning] = useState(false);
  const knownBridgeHosts = useRef<string[]>([]);
  const [gatewayId, setGatewayId] = useState<number | null>(null);
  const [pairingStatus, setPairingStatus] = useState<"waiting" | "pairing" | "paired" | "pending" | "error">("waiting");
  const [pairingError, setPairingError] = useState<string | null>(null);
  const [pairingEvents, setPairingEvents] = useState<{ event: PairingEvent; time: string }[]>([]);
  const pairingRequest = useRef<AbortController | null>(null);
  const pairingBusy = pairingStatus === "pairing";
  const pairingFinished = pairingStatus === "paired" || pairingStatus === "pending" || pairingStatus === "error";

  usePreventRemove(pairingBusy);

  useEffect(() => () => pairingRequest.current?.abort(), []);

  async function startPairing() {
    if (pairingRequest.current) return;
    if (!selectedBridge?.pairing || !selectedGateway || !gatewayId || !enrollmentCode) {
      setPairingStatus("error");
      setPairingError("Selecione um PC com a ponte atualizada e o gateway conectado antes de parear.");
      return;
    }
    const controller = new AbortController();
    pairingRequest.current = controller;
    setPairingStatus("pairing");
    setPairingError(null);
    setPairingEvents([]);
    try {
      const renewal = await apiFetch(`${getApiUrl()}/gateways/${gatewayId}/enrollment/renew`, { method: "POST" });
      const renewalBody = await renewal.json().catch(() => null);
      if (!renewal.ok || typeof renewalBody?.enrollmentCode !== "string") {
        throw new Error(getApiErrorMessage(renewalBody, "Não foi possível renovar o código de enrollment."));
      }
      setEnrollmentCode(renewalBody.enrollmentCode);
      await pairGateway({
        apiUrl: getApiUrl(), apiFetch, session: selectedBridge.pairing,
        gatewayId, gatewayMac: selectedGateway.mac,
        enrollmentCode: renewalBody.enrollmentCode, signal: controller.signal,
        onPending: () => {
          if (!controller.signal.aborted) setPairingStatus("pending");
        },
        onEvent: (event) => {
          if (!controller.signal.aborted) setPairingEvents((events) => [...events, { event, time: new Date().toLocaleTimeString() }]);
        },
      });
      if (!controller.signal.aborted) setPairingStatus("paired");
    } catch (pairingFailure) {
      if (!controller.signal.aborted) {
        if (pairingFailure instanceof PairingConfirmationPending) {
          setPairingStatus("pending");
        } else {
          setPairingStatus("error");
          setPairingError(pairingFailure instanceof Error ? pairingFailure.message : "Não foi possível parear o gateway.");
        }
      }
    } finally {
      if (pairingRequest.current === controller) pairingRequest.current = null;
    }
  }

  const scanLocalGateways = useCallback(async () => {
    setScanning(true);
    setError(null);
    setPairingError(null);
    setLocalBridges([]);
    setLocalGateways([]);
    setSelectedBridge(null);
    setSelectedGateway(null);
    try {
      const ip = await Network.getIpAddressAsync();
      const candidates = buildLocalBridgeCandidates(ip);
      if (!candidates.length) throw new Error("Conecte o telefone à mesma rede Wi-Fi privada do PC com a ponte.");
      // Ethernet gateway is attached to the PC, so probe the phone's Wi-Fi LAN
      // for the PC bridge. Include the phone address because the bridge binds
      // to the PC's Wi-Fi interface and may serve the phone's subnet.
      const octets = ip.split(".");
      const commonHosts = [
        `${octets[0]}.${octets[1]}.${octets[2]}.1`,
        `${octets[0]}.${octets[1]}.${octets[2]}.2`,
        `${octets[0]}.${octets[1]}.${octets[2]}.10`,
      ];
      const prefix = `${octets[0]}.${octets[1]}.${octets[2]}.`;
      const knownHosts = knownBridgeHosts.current.filter((host) => host.startsWith(prefix));
      const bridges = await discoverLocalBridges([...knownHosts, ...commonHosts, ...candidates], 1800, (bridge) => {
        knownBridgeHosts.current = [...new Set([...knownBridgeHosts.current, bridge.host])];
        setLocalBridges((current) => [...current, bridge]);
      });
      if (!bridges.length) setPairingError("Nenhum PC com gateway conectado foi encontrado nesta rede Wi-Fi.");
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : "Não foi possível localizar gateways.");
    } finally {
      setScanning(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void scanLocalGateways(), 0);
    return () => clearTimeout(timer);
  }, [scanLocalGateways]);

  const localDevicePicker = (
    <View className="gap-3 rounded-2xl border border-[#cddbd5] bg-white p-5">
      <Text className="text-xs font-bold uppercase tracking-widest text-slate-500">
        {selectedBridge ? "Gateway conectado" : "PCs com gateways nesta rede"}
      </Text>
      {scanning ? <Text className="text-sm text-slate-500">Procurando PCs e gateways…</Text> : null}
      {!scanning && !localBridges.length ? (
        <Text className="text-sm leading-5 text-slate-600">
          Nenhum gateway foi encontrado. Confirme que ele está conectado por cabo a um PC com a ponte instalada.
        </Text>
      ) : null}
      {localBridges.length > 0 && !selectedBridge ? localBridges.map((bridge) => (
        <Pressable
          key={bridge.host}
          disabled={pairingBusy}
          onPress={() => { setSelectedBridge(bridge); setLocalGateways(bridge.gateways); setPairingError(null); }}
          className="rounded-xl border border-slate-200 bg-white p-3"
        >
          <Text className="font-semibold text-slate-900">{bridge.model}</Text>
          <Text className="text-sm text-slate-600">Usuário: {bridge.username} · {bridge.gateways.length} gateway(s)</Text>
        </Pressable>
      )) : null}
      {selectedBridge ? (
        <>
          <Pressable disabled={pairingBusy} onPress={() => { setSelectedBridge(null); setSelectedGateway(null); }}>
            <Text className="font-semibold text-brand-blueDark">← Voltar à lista de PCs</Text>
          </Pressable>
          <Text className="text-sm text-slate-600">{selectedBridge.model} · {selectedBridge.username}</Text>
          {localGateways.map((gateway) => (
            <Pressable
              key={gateway.mac}
              disabled={pairingBusy}
              onPress={() => { setSelectedGateway(gateway); setManagementIpAddress(""); setPairingError(null); }}
              className={`rounded-xl border p-3 ${selectedGateway?.mac === gateway.mac ? "border-brand-blue bg-[#e8efea]" : "border-slate-200 bg-white"}`}
            >
              <Text className="font-semibold text-slate-900">MAC {gateway.mac}</Text>
              <Text className="text-sm text-slate-600">{gateway.model}</Text>
            </Pressable>
          ))}
        </>
      ) : null}
      <Pressable
        accessibilityRole="button"
        disabled={scanning || pairingBusy}
        onPress={() => void scanLocalGateways()}
        className={`min-h-11 items-center justify-center rounded-xl border border-brand-blue px-3 ${scanning ? "opacity-50" : ""}`}
      >
        <Text className="font-semibold text-brand-blueDark">{scanning ? "Buscando…" : "Buscar PCs novamente"}</Text>
      </Pressable>
    </View>
  );
  const pairingLayout = getGatewayPairingLayout(Boolean(enrollmentCode));

  async function createGateway() {
    if (!name.trim()) {
      setError("Informe um nome para identificar o gateway.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const response = await apiFetch(`${getApiUrl()}/gateways`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          ...(managementIpAddress.trim()
            ? { managementIpAddress: managementIpAddress.trim() }
            : {}),
          ...(gatewayEui.trim() ? { gatewayEui: gatewayEui.trim() } : {}),
          ...(location.trim() ? { location: location.trim() } : {}),
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          getApiErrorMessage(body, "Não foi possível criar o gateway."),
        );
      }

      if (typeof body?.enrollmentCode === "string") {
        setEnrollmentCode(body.enrollmentCode);
        setGatewayId(typeof body?.gateway?.id === "number" ? body.gateway.id : null);
        setPairingStatus("waiting");
        return;
      }
      const gatewayId = body?.gateway?.id;
      router.replace(gatewayId ? `/gateways/${gatewayId}` : "/gateways");
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Não foi possível criar o gateway.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={["top", "bottom"]}>
      <ScreenHeader
        backDisabled={pairingBusy}
        onBack={pairingFinished ? () => router.replace("/gateways") : undefined}
        title={enrollmentCode ? "Gateway criado" : "Novo gateway"}
        subtitle={enrollmentCode
          ? "Selecione o gateway e acompanhe o pareamento aqui no app."
          : "Cadastre o equipamento e prepare os recursos de conexão."}
      />
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          className="flex-1"
          contentContainerClassName="w-full max-w-3xl self-center flex-grow gap-5 px-5 py-6 pb-10 md:py-8"
          keyboardShouldPersistTaps="handled"
        >
          {pairingLayout.showDevicePicker ? localDevicePicker : null}
          {pairingLayout.showPairingCode ? (
            <View className="gap-4 rounded-2xl border border-[#cddbd5] bg-white p-5">
              <View className="flex-row items-center gap-3">
                <View className={`h-3 w-3 rounded-full ${pairingStatus === "paired" ? "bg-brand-green" : pairingStatus === "error" ? "bg-red-600" : "bg-amber-500"}`} />
                <Text className="text-sm font-semibold text-slate-700">
                  {pairingStatus === "paired" ? "Gateway pareado e online" : pairingStatus === "pending" ? "Aguardando confirmação online" : pairingStatus === "error" ? "Pareamento precisa de atenção" : pairingBusy ? "Pareamento em andamento" : "Pronto para parear"}
                </Text>
              </View>
              {pairingStatus !== "pending" && pairingStatus !== "paired" ? <Text className="text-sm leading-5 text-slate-600">Confira o gateway selecionado e toque em parear. A ponte faz a conexão automaticamente.</Text> : null}
              {!selectedBridge?.pairing && pairingStatus !== "pending" && pairingStatus !== "paired" ? <Text accessibilityRole="alert" className="text-sm leading-5 text-amber-800">A ponte deste PC ainda não está disponível para pareamento. Tente buscar novamente.</Text> : null}
              <Pressable accessibilityRole="button" disabled={pairingBusy || pairingStatus === "paired" || pairingStatus === "pending" || !selectedBridge?.pairing || !selectedGateway} onPress={() => void startPairing()} className={`min-h-12 items-center justify-center rounded-xl px-3 ${pairingBusy || pairingStatus === "paired" || pairingStatus === "pending" || !selectedBridge?.pairing || !selectedGateway ? "bg-slate-300" : "bg-brand-blue"}`}>
                <Text className="text-center font-semibold text-white">{pairingBusy ? "Pareando…" : pairingStatus === "pending" ? "Recebimento confirmado" : pairingStatus === "paired" ? "Pareamento concluído" : "Parear gateway"}</Text>
              </Pressable>
              {pairingStatus === "pending" ? <Text accessibilityLiveRegion="polite" className="text-sm leading-5 text-slate-600">O gateway recebeu o pareamento. A confirmação online pode levar mais tempo. Acompanhe pela lista de gateways; não é necessário parear novamente.</Text> : null}
              {pairingEvents.length ? <View accessibilityLiveRegion="polite" className="gap-3 border-l-2 border-[#cddbd5] pl-4">
                {pairingEvents.map(({ event, time }) => <View key={event} className="gap-1">
                  <Text className="text-xs text-slate-500">{time}</Text>
                  <Text className="text-sm font-semibold text-slate-800">{{ authorized: "PC autorizado pelo servidor", submitted: "Gateway confirmou o recebimento", online: "Servidor confirmou o gateway online" }[event]}</Text>
                </View>)}
              </View> : null}
              {pairingError ? <Text accessibilityRole="alert" className="text-sm leading-5 text-red-700">{pairingError}</Text> : null}
              {pairingBusy ? <Text accessibilityLiveRegion="polite" className="text-sm leading-5 text-slate-600">Aguarde o pareamento terminar para voltar.</Text> : null}
              {pairingFinished ? (
                <Pressable accessibilityRole="button" accessibilityLabel="Voltar aos gateways" onPress={() => router.replace("/gateways")} className="min-h-12 items-center justify-center rounded-xl border border-brand-blue px-3">
                  <Text className="font-semibold text-brand-blueDark">Voltar aos gateways</Text>
                </Pressable>
              ) : null}
              <Text className="text-xs leading-5 text-slate-500">
                O recebimento inicia a instalação. A conclusão depende da confirmação online pelo servidor.
              </Text>
            </View>
          ) : pairingLayout.showGatewayForm ? <>
          <View className="border-b border-[#cddbd5] pb-6">
            <Text className="text-[10px] font-bold tracking-[1.6px] text-slate-500">
              01  /  IDENTIDADE DO EQUIPAMENTO
            </Text>
            <View className="mt-5 gap-5">
              <FormField
                label="Nome do gateway"
                value={name}
                onChangeText={setName}
                placeholder="Ex.: Filial Curitiba"
                autoCapitalize="words"
                maxLength={100}
                returnKeyType="next"
              />
              <FormField
                label="EUI do equipamento"
                value={gatewayEui}
                onChangeText={(value) => setGatewayEui(value.toUpperCase())}
                placeholder="16 caracteres hexadecimais (opcional)"
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={16}
              />
              <FormField
                label="Localização"
                value={location}
                onChangeText={setLocation}
                placeholder="Ex.: Sala técnica — Curitiba"
                autoCapitalize="words"
                maxLength={255}
              />
            </View>
          </View>

          <View className="pt-1">
            <Text className="text-[10px] font-bold tracking-[1.6px] text-slate-500">
              02  /  ENDEREÇAMENTO
            </Text>
            <View className="mt-5">
            <FormField
              label="IP de gerenciamento"
              value={managementIpAddress}
              onChangeText={(value) => { setManagementIpAddress(value); setSelectedGateway(null); }}
              placeholder="Automático se ficar em branco"
              keyboardType="numbers-and-punctuation"
              autoCapitalize="none"
              autoCorrect={false}
              helperText="O sistema reserva um endereço disponível quando você não informar um."
            />
            </View>
          </View>

          <View className="border-l-2 border-brand-blue bg-[#e8efea] px-4 py-3">
            <Text className="text-[10px] font-bold tracking-[1.2px] text-brand-blueDark">
              PROVISIONAMENTO REMOTO
            </Text>
            <Text className="mt-1 text-sm leading-5 text-slate-700">
              Ao criar, o SagaNexus reservará o IP e solicitará os recursos de
              conexão necessários. A operação pode levar alguns segundos.
            </Text>
          </View>

          {error ? (
            <Text accessibilityRole="alert" className="text-sm text-red-700">
              {error}
            </Text>
          ) : null}

          <Pressable
            accessibilityRole="button"
            disabled={submitting}
            onPress={() => void createGateway()}
            className={`min-h-14 items-center justify-center rounded-xl px-5 ${submitting ? "bg-slate-400" : "bg-brand-blue active:bg-brand-blueDark"}`}
          >
            <Text className="text-base font-bold text-white">
              {submitting ? "Provisionando gateway…" : "Criar gateway"}
            </Text>
          </Pressable>
          </> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
