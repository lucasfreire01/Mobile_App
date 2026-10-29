import { Image, Text, View } from "react-native";

export const brandAssets = {
  logo: require("../../assets/branding/saganexus-logo.png"),
  symbol: require("../../assets/branding/saganexus-symbol.png"),
};

export function Brand() {
  return (
    <View className="self-start rounded-lg bg-white px-3 py-1.5">
      <Image
        source={brandAssets.logo}
        accessibilityLabel="SagaNexus"
        resizeMode="contain"
        className="!h-9 !w-32"
      />
    </View>
  );
}

export function StatusBadge({ online }: { online: boolean }) {
  return (
    <View
      className={`flex-row items-center gap-2 border-l-2 pl-2.5 ${online ? "border-brand-green" : "border-slate-400"}`}
    >
      <View
        className={`h-2 w-2 rounded-full ${online ? "bg-brand-green" : "bg-slate-400"}`}
      />
      <Text
        className={`text-[10px] font-bold tracking-[1px] ${online ? "text-brand-greenDark" : "text-slate-600"}`}
      >
        {online ? "ONLINE" : "OFFLINE"}
      </Text>
    </View>
  );
}
