import { useCallback, useState } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "../auth/auth-context";
import { BrandSplash } from "../components/brand-splash";
import "../../global.css";

function SessionNavigator() {
  const { isRestoring, token, user } = useAuth();
  const [splashEntered, setSplashEntered] = useState(false);
  const handleSplashEntered = useCallback(() => setSplashEntered(true), []);
  // The navigator only mounts once session restoration and the logo entry finish.
  // Screens cannot render or redirect underneath the initial splash.
  if (isRestoring || !splashEntered) {
    return (
      <View className="flex-1 bg-white">
        <BrandSplash onEntered={handleSplashEntered} />
      </View>
    );
  }
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "#f8fafc" },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Protected guard={!token}>
        <Stack.Screen name="login" />
      </Stack.Protected>
      <Stack.Protected guard={!!token && !!user?.isAdmin}>
        <Stack.Screen name="gateways" />
        <Stack.Screen name="gateways/new" />
        <Stack.Screen name="gateways/[id]" />
        <Stack.Screen name="gateways/[id]/operations" />
        <Stack.Screen name="users/new" />
      </Stack.Protected>
      <Stack.Protected guard={!!token && !user?.isAdmin}>
        <Stack.Screen name="access-denied" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="light" />
        <SessionNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
