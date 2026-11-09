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
import { router } from "expo-router";
import { FormField } from "../../components/form-field";
import { ScreenHeader } from "../../components/screen-header";
import { useAuth } from "../../auth/auth-context";
import { getApiUrl } from "../../config/api";
import { getApiErrorMessage } from "../../lib/api-error";

export default function NewUserScreen() {
  const { apiFetch } = useAuth();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdEmail, setCreatedEmail] = useState<string | null>(null);

  async function createUser() {
    if (password !== passwordConfirmation) {
      setError("As senhas não conferem.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const response = await apiFetch(`${getApiUrl()}/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: fullName.trim(),
          email: email.trim().toLowerCase(),
          password,
          passwordConfirmation,
          isAdmin,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          getApiErrorMessage(body, "Não foi possível criar o usuário."),
        );
      }

      setCreatedEmail(body?.user?.email ?? email.trim().toLowerCase());
      setPassword("");
      setPasswordConfirmation("");
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Não foi possível criar o usuário.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={["top", "bottom"]}>
      <ScreenHeader
        title="Novo usuário"
        subtitle="Crie uma conta interna para acessar o SagaNexus."
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
          {createdEmail ? (
            <View className="gap-4 rounded-2xl border border-emerald-200 bg-white p-6">
              <Text
                accessibilityRole="header"
                className="text-xl font-bold text-brand-blueDark"
              >
                Usuário criado
              </Text>
              <Text className="text-sm leading-6 text-slate-700">
                A conta {createdEmail} está pronta. Compartilhe a senha inicial
                com segurança.
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.replace("/gateways")}
                className="min-h-12 items-center justify-center rounded-xl bg-brand-blue px-4"
              >
                <Text className="font-bold text-white">Voltar aos gateways</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View className="gap-5 border-b border-[#cddbd5] pb-6">
                <Text className="text-[10px] font-bold tracking-[1.6px] text-slate-500">
                  01  /  DADOS DE ACESSO
                </Text>
                <FormField
                  label="Nome completo"
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder="Nome da pessoa"
                  autoCapitalize="words"
                  maxLength={120}
                  autoComplete="name"
                />
                <FormField
                  label="E-mail corporativo"
                  value={email}
                  onChangeText={setEmail}
                  placeholder="nome@empresa.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                />
                <FormField
                  label="Senha inicial"
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Mínimo 8 caracteres"
                  secureTextEntry
                  autoComplete="new-password"
                  maxLength={32}
                />
                <FormField
                  label="Confirmar senha"
                  value={passwordConfirmation}
                  onChangeText={setPasswordConfirmation}
                  placeholder="Digite a senha novamente"
                  secureTextEntry
                  autoComplete="new-password"
                  maxLength={32}
                />
              </View>

              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: isAdmin }}
                onPress={() => setIsAdmin((value) => !value)}
                className="flex-row items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4"
              >
                <View
                  className={`mt-0.5 h-6 w-6 items-center justify-center rounded-md border ${isAdmin ? "border-brand-blue bg-brand-blue" : "border-slate-400 bg-white"}`}
                >
                  {isAdmin ? (
                    <Text className="font-bold text-white">✓</Text>
                  ) : null}
                </View>
                <View className="flex-1">
                  <Text className="font-semibold text-brand-blueDark">
                    Acesso de administrador
                  </Text>
                  <Text className="mt-1 text-sm leading-5 text-slate-600">
                    Administradores podem consultar e provisionar gateways e
                    criar usuários. Sem essa permissão, a conta não acessa as
                    rotas administrativas atuais.
                  </Text>
                </View>
              </Pressable>

              {error ? (
                <Text accessibilityRole="alert" className="text-sm text-red-700">
                  {error}
                </Text>
              ) : null}

              <Pressable
                accessibilityRole="button"
                disabled={submitting}
                onPress={() => void createUser()}
                className={`min-h-14 items-center justify-center rounded-xl px-5 ${submitting ? "bg-slate-400" : "bg-brand-blue active:bg-brand-blueDark"}`}
              >
                <Text className="text-base font-bold text-white">
                  {submitting ? "Criando usuário…" : "Criar usuário"}
                </Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
