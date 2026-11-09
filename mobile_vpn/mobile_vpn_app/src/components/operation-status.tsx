import { Text, View } from "react-native";

export function OperationStatus({
  status,
}: {
  status: "pending" | "applying" | "applied" | "failed";
}) {
  const variants = {
    pending: {
      label: "Na fila",
      surface: "bg-brand-blueLight",
      text: "text-brand-blue",
    },
    applying: {
      label: "Aplicando",
      surface: "bg-amber-50",
      text: "text-amber-800",
    },
    applied: {
      label: "Aplicada",
      surface: "bg-brand-greenLight",
      text: "text-brand-greenDark",
    },
    failed: { label: "Falhou", surface: "bg-red-50", text: "text-red-800" },
  };
  const variant = variants[status];
  return (
    <View className={`self-start rounded-full px-3 py-1.5 ${variant.surface}`}>
      <Text className={`text-xs font-semibold ${variant.text}`}>
        {variant.label}
      </Text>
    </View>
  );
}
