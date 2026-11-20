import React, { useEffect, useRef } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

export const palette = {
  bg: "#F4F2EB",
  paper: "#FFFDF8",
  ink: "#181B18",
  muted: "#55594F",
  line: "#D6D4C8",
  rule: "#B9B7AA",
  green: "#1D3822",
  // The receipt pink: the one accent, for the thing to look at.
  lime: "#F5BBB2",
  pink: "#F5BBB2",
  pale: "#ECE8DB",
  red: "#A63A2B",
};
/** Web loads Funnel Display / Funnel Sans (see WebPolish); native uses the system face. */
export const display = Platform.select({
  web: "'Funnel Display', 'Helvetica Neue', Arial, sans-serif",
  default: undefined,
});
export const sans = Platform.select({
  web: "'Funnel Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  default: undefined,
});
// Headings share the landing page's display face on web; native keeps a system serif.
/** Line-item figures share the receipt's monospace on web. */
export const mono = Platform.select({
  web: "'IBM Plex Mono', ui-monospace, Menlo, monospace",
  ios: "Menlo",
  default: "monospace",
});
export const serif = Platform.select({
  ios: "Georgia",
  android: "serif",
  default: "'Funnel Display', 'Helvetica Neue', Arial, sans-serif",
});

/** Finite motion, canceled on unmount or when the OS requests reduced motion. */
export function useEntrance(identity = "", delay = 0, drift = false) {
  const progress = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    progress.setValue(1);
    let active = true;
    let animation: Animated.CompositeAnimation | undefined;
    const reduce = (enabled: boolean) => {
      if (enabled) {
        animation?.stop();
        progress.setValue(1);
      }
    };
    const listener = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      reduce,
    );
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (!active || enabled) return;
        progress.setValue(0);
        animation = Animated.timing(progress, {
          toValue: 1,
          duration: drift ? 2800 : 650,
          delay,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: Platform.OS !== "web",
        });
        animation.start();
      })
      .catch(() => {});
    return () => {
      active = false;
      animation?.stop();
      listener.remove();
    };
  }, [delay, drift, progress, identity]);
  return {
    opacity: drift ? 1 : progress,
    transform: [
      {
        translateY: progress.interpolate(
          drift
            ? { inputRange: [0, 0.3, 0.65, 1], outputRange: [0, -9, 4, 0] }
            : { inputRange: [0, 1], outputRange: [18, 0] },
        ),
      },
    ],
  };
}
export function Reveal({
  children,
  delay = 0,
  drift = false,
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  drift?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const entrance = useEntrance("", delay, drift);
  return <Animated.View style={[style, entrance]}>{children}</Animated.View>;
}

export function Brand({
  compact = false,
  inverse = false,
  tone,
}: {
  compact?: boolean;
  inverse?: boolean;
  tone?: string;
}) {
  const color = tone || (inverse ? "#F4FAED" : palette.green);
  return (
    <View
      accessibilityLabel="Fairshare"
      style={{ flexDirection: "row", alignItems: "center", gap: 9 }}
    >
      <View accessible={false} style={{ width: 26, height: 28 }}>
        <View
          style={[styles.half, styles.left, { backgroundColor: color, top: 0 }]}
        />
        <View
          style={[
            styles.half,
            styles.right,
            { backgroundColor: color, top: 4, opacity: 0.55 },
          ]}
        />
      </View>
      {!compact && (
        <Text
          style={{
            color,
            fontFamily: display,
            fontSize: 27,
            fontWeight: "700",
            letterSpacing: -1.1,
          }}
        >
          fairshare
        </Text>
      )}
    </View>
  );
}

export function Eyebrow({
  children,
  light = false,
}: {
  children: React.ReactNode;
  light?: boolean;
}) {
  return (
    <Text
      style={{
        fontSize: 10,
        letterSpacing: 2,
        fontWeight: "700",
        color: light ? "#DCEAC8" : palette.green,
      }}
    >
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  half: { position: "absolute", width: 12, height: 24 },
  left: { left: 0, borderTopLeftRadius: 12, borderBottomLeftRadius: 12 },
  right: { left: 14, borderTopRightRadius: 12, borderBottomRightRadius: 12 },
});
