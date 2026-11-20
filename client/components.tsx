import React, { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { palette } from "./design";
export const C = palette;
export const icon = (name: any, size = 18, color = C.ink) => (
  <Feather name={name} size={size} color={color} />
);
export function Button({
  label,
  onPress,
  secondary = false,
  disabled = false,
  small = false,
  quiet = false,
  accent = false,
  inverse = false,
  accessibilityLabel,
}: any) {
  const [hovered, setHovered] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      onPress={onPress}
      disabled={disabled}
      accessibilityState={{ disabled: !!disabled }}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={({ pressed }) => [
        s.button,
        secondary && s.secondary,
        small && { minHeight: 40, paddingVertical: 8, paddingHorizontal: 16 },
        quiet && s.quiet,
        accent && { backgroundColor: C.pink, borderColor: C.pink },
        inverse && { backgroundColor: "transparent", borderColor: C.bg },
        hovered &&
          !disabled && {
            backgroundColor: inverse
              ? "rgba(244,242,235,0.14)"
              : accent
                ? C.bg
                : secondary || quiet
                  ? C.pale
                  : C.ink,
            borderColor: inverse
              ? C.bg
              : accent
                ? C.bg
                : quiet || secondary
                  ? C.ink
                  : C.ink,
          },
        pressed && { transform: [{ scale: 0.98 }] },
        disabled && { opacity: 0.45 },
      ]}
    >
      <Text
        style={[
          s.buttonText,
          (secondary || quiet || accent) && { color: C.ink },
          inverse && { color: C.bg },
          quiet && { fontSize: 13 },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}
export function Field({ label, value, onChangeText, ...props }: any) {
  return (
    <View style={{ gap: 7, marginBottom: 15 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        placeholderTextColor="#949C95"
        style={s.input}
        {...props}
      />
    </View>
  );
}
export function Pills({ items, value, onChange }: any) {
  return (
    <View style={s.wrap}>
      {items.map((item: any) => {
        const id = typeof item === "string" ? item : item.id;
        return (
          <Pressable
            key={id}
            accessibilityRole="button"
            accessibilityState={{ selected: value === id }}
            onPress={() => onChange(id)}
            style={[
              s.pill,
              value === id && { backgroundColor: C.ink, borderColor: C.ink },
            ]}
          >
            <Text
              style={{
                color: value === id ? C.bg : C.ink,
                fontWeight: "600",
              }}
            >
              {typeof item === "string" ? item : item.name}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
export function Card({ children, style }: any) {
  return <View style={[s.card, style]}>{children}</View>;
}
export function Tag({ text }: any) {
  return (
    <View style={s.tag}>
      <Text
        style={{
          color: C.ink,
          fontSize: 13,
          fontWeight: "600",
        }}
      >
        {text}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  button: {
    backgroundColor: C.green,
    minHeight: 46,
    borderWidth: 1,
    borderColor: C.green,
    paddingVertical: 11,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  secondary: { backgroundColor: "transparent" },
  quiet: {
    backgroundColor: "transparent",
    minHeight: 32,
    borderWidth: 1,
    borderColor: C.ink,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  buttonText: { fontWeight: "600", fontSize: 15, color: C.bg },
  label: { fontSize: 14, fontWeight: "600", color: C.ink },
  input: {
    minHeight: 50,
    borderWidth: 1.5,
    borderColor: C.rule,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 16,
    color: C.ink,
    backgroundColor: C.paper,
  },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 0,
    backgroundColor: C.pale,
  },
  card: {
    backgroundColor: C.paper,
    padding: 24,
    borderWidth: 1,
    borderColor: C.line,
  },
  tag: {
    backgroundColor: C.pink,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: "flex-start",
  },
});
