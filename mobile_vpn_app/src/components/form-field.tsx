import { Text, TextInput, View, type TextInputProps } from "react-native";

type FormFieldProps = TextInputProps & {
  label: string;
  helperText?: string;
  className?: string;
};

export function FormField({ label, helperText, className, ...inputProps }: FormFieldProps) {
  return (
    <View className="gap-2">
      <Text className="text-[10px] font-bold tracking-[1.2px] text-slate-600">
        {label.toUpperCase()}
      </Text>
      <TextInput
        {...inputProps}
        className={`min-h-12 border-b border-[#b9c9c5] bg-transparent px-0 text-base text-slate-900 focus:border-brand-blue ${className ?? ""}`}
      />
      {helperText ? (
        <Text className="text-xs leading-5 text-slate-500">{helperText}</Text>
      ) : null}
    </View>
  );
}
