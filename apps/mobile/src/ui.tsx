import type { ReactNode } from "react";
import { View, Text, TextInput, Pressable, Image } from "react-native";
import { photos, listingPhoto, type PhotoKey } from "@qayda/domain";
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
// Metro needs statically analyzable requires to package photos for offline use.
/* eslint-disable @typescript-eslint/no-require-imports */
const photoSources = {
  konyr: require("../assets/photos/konyr.jpg"),
  lake: require("../assets/photos/lake.jpg"),
  semey: require("../assets/photos/semey.jpg"),
  almaty: require("../assets/photos/almaty.jpg"),
  abay: require("../assets/photos/abay.jpg"),
  zhidebay: require("../assets/photos/zhidebay.jpg"),
  dostoevsky: require("../assets/photos/dostoevsky.jpg"),
  kasteev: require("../assets/photos/kasteev.jpg"),
  opera: require("../assets/photos/opera.jpg"),
  auezov: require("../assets/photos/auezov.jpg"),
};
/* eslint-enable @typescript-eslint/no-require-imports */
export function Art({
  large = false,
  listingId,
  photoKey,
  height,
}: {
  height?: number;
  large?: boolean;
  listingId?: string;
  photoKey?: PhotoKey;
}) {
  const key = photoKey ?? listingPhoto(listingId);
  return (
    <View
      style={[
        s.art,
        large && { height: 260 },
        height !== undefined && { height },
      ]}
    >
      {key ? (
        <Image
          source={photoSources[key]}
          accessibilityLabel={photos[key].alt}
          style={{ width: "100%", height: "100%" }}
          resizeMode="cover"
        />
      ) : (
        <View style={s.photoPending}>
          <Text style={s.copy}>Здесь будет фото места</Text>
        </View>
      )}
    </View>
  );
}
export function Card({ children }: { children: ReactNode }) {
  return <View style={s.card}>{children}</View>;
}
export function Heading({ children }: { children: ReactNode }) {
  return <Text style={s.h2}>{children}</Text>;
}
export function Copy({
  children,
  lines,
}: {
  children: ReactNode;
  lines?: number;
}) {
  return (
    <Text style={s.copy} numberOfLines={lines}>
      {children}
    </Text>
  );
}
