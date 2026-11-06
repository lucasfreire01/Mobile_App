import { useEffect, useRef, useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type ScrollViewInstance,
  type TextInputInstance,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Brand } from "../components/brand";
import { BrandLoadingOverlay } from "../components/brand-loading-overlay";
import { useAuth } from "../auth/auth-context";

export default function LoginScreen() {
  const { isRestoring, login, token } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const scroll = useRef<ScrollViewInstance | null>(null);
  const passwordInput = useRef<TextInputInstance | null>(null);
  const focusedField = useRef<"email" | "password" | null>(null);

  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", () => {
      setKeyboardVisible(true);
      requestAnimationFrame(() => {
        if (focusedField.current === "password") {
          scroll.current?.scrollToEnd({ animated: true });
        } else {
          scroll.current?.scrollTo({ y: 0, animated: true });
        }
      });
    });
    const hide = Keyboard.addListener("keyboardDidHide", () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
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
    <SafeAreaView className="flex-1 bg-brand-blueDark" edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          ref={scroll}
          className="flex-1"
          contentContainerClassName="flex-grow"
          keyboardShouldPersistTaps="handled"
          onLayout={() => {
            if (focusedField.current === "password") requestAnimationFrame(() => scroll.current?.scrollToEnd({ animated: true }));
          }}
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
        >
          <View className="w-full max-w-6xl flex-grow self-center md:flex-row md:items-center md:gap-16 md:px-12 md:py-16">
            <View className={`relative overflow-hidden px-7 md:flex-1 md:px-0 ${keyboardVisible ? "py-4" : "pb-9 pt-7 md:py-12"}`}>
              <Brand />
              {!keyboardVisible ? (
                <>
                  <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" className="absolute -right-10 top-20 h-44 w-44 rounded-full border border-[#315768] md:top-16 md:h-64 md:w-64">
                    <View className="absolute left-7 top-7 h-28 w-28 rounded-full border border-[#315768] md:h-48 md:w-48" />
                    <View className="absolute left-1 top-20 h-3 w-3 rounded-full bg-brand-green" />
                    <View className="absolute right-8 top-4 h-2 w-2 rounded-full bg-[#74aab6]" />
                  </View>
                  <Text className="mt-9 text-[10px] font-bold tracking-[2.5px] text-[#9cbcc7]">SAGANEXUS / OPERAÇÃO REMOTA</Text>
                  <Text accessibilityRole="header" className="mt-4 text-[38px] font-bold leading-[42px] tracking-tight text-white md:text-5xl md:leading-[54px]">Sua rede.{"\n"}<Text className="text-[#7bce91]">Sob controle.</Text></Text>
                  <Text className="mt-4 max-w-xs text-sm leading-6 text-[#bfd1d8]">Um ponto de acesso para acompanhar seus gateways e operar sua rede.</Text>
                </>
              ) : null}
            </View>
            <View className="flex-grow rounded-t-[28px] bg-white px-7 pb-8 pt-8 md:w-[420px] md:flex-grow-0 md:rounded-2xl md:p-9">
              <View className="mb-6 h-1 w-10 rounded-full bg-brand-green" />
              <Text className="text-[10px] font-bold tracking-[2px] text-slate-500">ACESSO À PLATAFORMA</Text>
              <Text accessibilityRole="header" className="mt-2 text-[28px] font-bold tracking-tight text-brand-blueDark">Bem-vindo de volta.</Text>
              <Text className="mt-2 text-sm leading-6 text-slate-600">Entre com sua conta para continuar.</Text>

            <View className="mt-8">
              <Text
                nativeID="email-label"
                className="mb-2 text-sm font-semibold text-slate-700"
              >
                E-mail
              </Text>
              <TextInput
                accessibilityLabel="E-mail"
                editable={!submitting}
                onFocus={() => { focusedField.current = "email"; }}
                onSubmitEditing={() => passwordInput.current?.focus()}
                submitBehavior="submit"
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
                className="min-h-14 rounded-lg border border-[#c9d7dc] bg-[#f5f8f9] px-4 text-base text-slate-900 focus:border-brand-blue"
              />
            </View>

            <View className="mt-5">
              <Text
                nativeID="password-label"
                className="mb-2 text-sm font-semibold text-slate-700"
              >
                Senha
              </Text>
              <View className="min-h-14 flex-row items-center rounded-lg border border-[#c9d7dc] bg-[#f5f8f9] px-4 focus-within:border-brand-blue">
                <TextInput
                  ref={passwordInput}
                  accessibilityLabel="Senha"
                  editable={!submitting}
                  onFocus={() => {
                    focusedField.current = "password";
                    requestAnimationFrame(() => scroll.current?.scrollToEnd({ animated: true }));
                  }}
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
                  className="min-h-14 flex-1 px-0 text-base text-slate-900"
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
            <View className="mt-7 flex-row items-center gap-2 border-t border-slate-100 pt-5">
              <View className="h-1.5 w-1.5 rounded-full bg-brand-green" />
              <Text className="text-xs text-slate-500">Sua operação começa com uma conexão.</Text>
            </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      <BrandLoadingOverlay visible={submitting} label="Entrando na sua conta" />
    </SafeAreaView>
  );
}
