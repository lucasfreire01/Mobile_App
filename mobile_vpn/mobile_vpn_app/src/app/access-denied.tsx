import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Brand } from "../components/brand";
import { useAuth } from "../auth/auth-context";

export default function AccessDeniedScreen() {
  const { logout } = useAuth();

  async function signOut() {
    await logout();
    router.replace("/login");
  }

  return (
    <SafeAreaView className="flex-1 bg-brand-blueDark">
      <View className="flex-1 justify-center px-6 py-10">
        <View className="w-full max-w-md self-center rounded-3xl bg-white p-6 md:p-8">
          <Brand />
          <Text
            accessibilityRole="header"
            className="mt-8 text-2xl font-bold text-brand-blueDark"
          >
            Acesso restrito
          </Text>
          <Text className="mt-3 text-base leading-6 text-slate-600">
            Esta conta não tem permissão de administrador para acessar as rotas
            de operação. Peça acesso a um administrador da empresa.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void signOut()}
            className="mt-7 min-h-14 items-center justify-center rounded-xl bg-brand-blue px-5"
          >
            <Text className="font-bold text-white">Sair da conta</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}
