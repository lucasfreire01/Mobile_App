import { useState } from "react";
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
import { router } from "expo-router";

export default function NewGatewayScreen() {
  const { apiFetch } = useAuth();
  const [name, setName] = useState("");
  const [managementIpAddress, setManagementIpAddress] = useState("");
  const [gatewayEui, setGatewayEui] = useState("");
  const [location, setLocation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        title="Novo gateway"
        subtitle="Cadastre o equipamento e prepare os recursos de conexão."
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
              onChangeText={setManagementIpAddress}
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
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
