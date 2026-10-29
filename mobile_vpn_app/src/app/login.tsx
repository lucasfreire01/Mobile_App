import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Brand } from "../components/brand";
import { BrandLoadingOverlay } from "../components/brand-loading-overlay";
import { useAuth } from "../auth/auth-context";

export default function LoginScreen() {
  const { isRestoring, login, token } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isRestoring && token) router.replace("/");
  }, [isRestoring, token]);

  async function handleLogin() {
    if (submitting || !email.trim() || !password) return;
    setError(null);
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      router.replace("/");
    } catch (loginError) {
      setError(
        loginError instanceof Error
          ? loginError.message
          : "Não foi possível entrar.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const loginDisabled = submitting || !email.trim() || !password;

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.select({ ios: "padding", android: undefined })}
      >
        <ScrollView
          className="flex-1"
          contentContainerClassName="flex-grow justify-center px-6 py-10"
          keyboardShouldPersistTaps="handled"
        >
          <View className="w-full max-w-sm self-center">
            <Brand />

            <Text className="mt-10 text-3xl font-bold tracking-tight text-brand-blueDark">
              Entrar
            </Text>
            <Text className="mt-2 text-base leading-6 text-slate-600">
              Acesse sua conta SagaNexus.
            </Text>

            <View className="mt-8">
              <Text
                nativeID="email-label"
                className="mb-2 text-sm font-semibold text-slate-700"
              >
                E-mail
              </Text>
              <TextInput
                accessibilityLabel="E-mail"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                keyboardType="email-address"
                onChangeText={setEmail}
                placeholder="voce@empresa.com"
                placeholderTextColor="#718096"
                returnKeyType="next"
                textContentType="emailAddress"
                value={email}
                className="min-h-12 rounded-lg border border-slate-300 bg-white px-4 text-base text-slate-900 focus:border-brand-blue"
              />
            </View>

            <View className="mt-5">
              <Text
                nativeID="password-label"
                className="mb-2 text-sm font-semibold text-slate-700"
              >
                Senha
              </Text>
              <View className="min-h-12 flex-row items-center rounded-lg border border-slate-300 bg-white px-4 focus-within:border-brand-blue">
                <TextInput
                  accessibilityLabel="Senha"
                  autoCapitalize="none"
                  autoComplete="current-password"
                  onChangeText={setPassword}
                  onSubmitEditing={handleLogin}
                  placeholder="Sua senha"
                  placeholderTextColor="#718096"
                  returnKeyType="go"
                  secureTextEntry={!showPassword}
                  textContentType="password"
                  value={password}
                  className="min-h-12 flex-1 px-0 text-base text-slate-900"
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    showPassword ? "Ocultar senha" : "Mostrar senha"
                  }
                  disabled={submitting}
                  onPress={() => setShowPassword((visible) => !visible)}
                  className="min-h-12 justify-center pl-3"
                >
                  <Text className="text-sm font-semibold text-brand-blue">
                    {showPassword ? "Ocultar" : "Mostrar"}
                  </Text>
                </Pressable>
              </View>
            </View>

            {error ? (
              <Text
                accessibilityRole="alert"
                className="mt-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm leading-5 text-red-800"
              >
                {error}
              </Text>
            ) : null}

            <Pressable
              accessibilityRole="button"
              accessibilityState={{
                disabled: loginDisabled,
                busy: submitting,
              }}
              disabled={loginDisabled}
              onPress={handleLogin}
              className={`mt-7 min-h-14 items-center justify-center rounded-lg px-5 ${loginDisabled ? "bg-slate-400" : "bg-brand-blueDark active:bg-brand-blue"}`}
            >
              <Text className="text-base font-bold text-white">
                {submitting ? "Entrando…" : "Entrar"}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      <BrandLoadingOverlay visible={submitting} label="Entrando na sua conta" />
    </SafeAreaView>
  );
}
