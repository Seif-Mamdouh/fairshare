import React from "react";
import { View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import Feather from "@expo/vector-icons/Feather";
export const C = {
  bg: "#F7F9F8",
  paper: "#FFFFFF",
  ink: "#373B3F",
  muted: "#858A8E",
  line: "#E8EAEA",
  green: "#3C8876",
  lime: "#D9ED9A",
  pale: "#E9F6F3",
  red: "#D65D2A",
};
export const icon = (name: any, size = 18, color = C.ink) => (
  <Feather name={name} size={size} color={color} />
);
export function Button({
  label,
  onPress,
  secondary = false,
  disabled = false,
  small = false,
}: any) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        s.button,
        secondary && s.secondary,
        small && { paddingVertical: 10, paddingHorizontal: 14 },
        (pressed || disabled) && { opacity: 0.6 },
      ]}
    >
      <Text style={[s.buttonText, secondary && { color: C.ink }]}>{label}</Text>
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
              value === id && { backgroundColor: C.pale, borderColor: C.green },
            ]}
          >
            <Text
              style={{
                color: value === id ? C.green : C.muted,
                fontWeight: value === id ? "600" : "400",
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
          color: C.green,
          fontSize: 11,
          fontWeight: "700",
          letterSpacing: 0.4,
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
    borderRadius: 5,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  secondary: { backgroundColor: C.paper, borderWidth: 1, borderColor: C.line },
  buttonText: { fontWeight: "600", fontSize: 13, color: "white" },
  label: { fontSize: 13, fontWeight: "600", color: C.ink },
  input: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 5,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
    color: C.ink,
    backgroundColor: "#FDFEFC",
  },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.paper,
  },
  card: {
    backgroundColor: C.paper,
    borderRadius: 5,
    padding: 24,
    borderWidth: 1,
    borderColor: C.line,
  },
  tag: {
    backgroundColor: "#E9F6F3",
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 5,
    alignSelf: "flex-start",
  },
});
