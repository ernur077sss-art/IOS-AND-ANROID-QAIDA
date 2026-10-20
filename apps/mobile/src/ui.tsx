import type { ReactNode } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { color, s } from "./theme";
export function Button({
  children,
  onPress,
  secondary = false,
  disabled = false,
}: {
  children: ReactNode;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        secondary && s.secondary,
        (pressed || disabled) && s.dim,
      ]}
    >
      <Text style={[s.buttonText, secondary && s.secondaryText]}>
        {children}
      </Text>
    </Pressable>
  );
}
export function Field({
  label,
  value,
  onChange,
  placeholder,
  keyboardType = "default",
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "email-address" | "numeric" | "decimal-pad";
  multiline?: boolean;
}) {
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={color.muted}
        keyboardType={keyboardType}
        autoCapitalize={keyboardType === "email-address" ? "none" : "sentences"}
        autoCorrect={keyboardType === "default"}
        multiline={multiline}
        maxLength={multiline ? 2000 : 500}
        style={[
          s.input,
          multiline && { minHeight: 100, textAlignVertical: "top" },
        ]}
      />
    </View>
  );
}
export function Art({ large = false }: { large?: boolean }) {
  return (
    <View
      accessibilityLabel="Авторская иллюстрация гор"
      style={[s.art, large && { height: 240 }]}
    >
      <View style={s.sun} />
      <View style={s.mountainBack} />
      <View style={s.mountain} />
      <View style={s.hill} />
      <Text style={s.artLabel}>Иллюстрация · Казахстан</Text>
    </View>
  );
}
export function Card({ children }: { children: ReactNode }) {
  return <View style={s.card}>{children}</View>;
}
export function Heading({ children }: { children: ReactNode }) {
  return <Text style={s.h2}>{children}</Text>;
}
export function Copy({ children }: { children: ReactNode }) {
  return <Text style={s.copy}>{children}</Text>;
}
