import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { Brand } from "./brand";
export function ScreenHeader({
  title,
  subtitle,
  onRefresh,
  refreshing = false,
}: {
  title: string;
  subtitle: string;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  return (
    <View className="bg-brand-blueDark px-5 pb-6 pt-4 md:px-8">
      <View className="w-full max-w-5xl self-center">
        <View className="flex-row items-center justify-between gap-3">
          <Brand />
          <View className="flex-row items-center gap-2">
            {onRefresh ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Atualizar"
                disabled={refreshing}
                onPress={onRefresh}
                className="min-h-12 justify-center px-3 active:bg-white/10"
              >
                <Text className="text-xs font-bold tracking-[0.8px] text-[#c4d5d8]">
                  {refreshing ? "ATUALIZANDO" : "ATUALIZAR"}
                </Text>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Voltar"
              onPress={() =>
                router.canGoBack() ? router.back() : router.replace("/gateways")
              }
              className="min-h-12 min-w-12 items-center justify-center rounded-full border border-white/25 active:bg-white/10"
            >
              <Text className="text-xl leading-6 text-white">‹</Text>
            </Pressable>
          </View>
        </View>
        <View className="mt-6 flex-row items-start gap-4">
          <View className="flex-1">
            <Text className="mb-2 text-[10px] font-bold tracking-[1.8px] text-[#8fb0b8]">
              SAGANEXUS  /  OPERAÇÃO REMOTA
            </Text>
            <Text
              accessibilityRole="header"
              className="text-[28px] font-bold leading-9 tracking-tight text-white"
            >
              {title}
            </Text>
            <Text className="mt-2 max-w-xl text-sm leading-5 text-[#c4d5d8]">
              {subtitle}
            </Text>
          </View>
        </View>
        <View className="mt-5 h-px bg-white/15">
          <View className="h-px w-1/3 bg-[#8fb0b8]" />
        </View>
      </View>
    </View>
  );
}
