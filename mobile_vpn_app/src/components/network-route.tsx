import { Text, View } from "react-native";

const stops = ["SAGANEXUS", "REDE", "BROWAN"];

/** A quiet topology cue, not a live connection indicator. */
export function NetworkRoute({ className = "" }: { className?: string }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className={`flex-row items-center ${className}`}
    >
      {stops.map((stop, index) => (
        <View key={stop} className="flex-row flex-1 items-center">
          <View className="items-center gap-2">
            <View className="h-7 w-7 items-center justify-center rounded-full border border-[#7895a1]">
              <View className="h-1.5 w-1.5 rounded-full bg-[#9eb5bd]" />
            </View>
            <Text className="text-[9px] font-semibold tracking-[1.2px] text-[#b9ced5]">
              {stop}
            </Text>
          </View>
          {index < stops.length - 1 ? (
            <View className="mx-2 mb-4 h-px flex-1 bg-[#526d7b]" />
          ) : null}
        </View>
      ))}
    </View>
  );
}
