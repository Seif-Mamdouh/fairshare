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
  bg: "#FCF9F5",
  paper: "#FFFFFF",
  ink: "#181B18",
  muted: "#676D65",
  line: "#E5E7DE",
  green: "#426B3F",
  lime: "#DCEAC8",
  pale: "#EDF3E8",
  red: "#B54B30",
};
export const serif = Platform.select({
  ios: "Georgia",
  android: "serif",
  default: "Georgia, 'Times New Roman', serif",
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
}: {
  compact?: boolean;
  inverse?: boolean;
}) {
  const color = inverse ? "#F4FAED" : palette.green;
  return (
    <View
      accessibilityLabel="Fairshare"
      style={{ flexDirection: "row", alignItems: "center", gap: 9 }}
    >
      <View
        accessible={false}
        style={{ width: 30, height: 30, transform: [{ rotate: "-12deg" }] }}
      >
        <View
          style={[styles.share, { backgroundColor: color, left: 0, top: 0 }]}
        />
        <View
          style={[
            styles.share,
            { backgroundColor: color, right: 0, bottom: 0, opacity: 0.6 },
          ]}
        />
      </View>
      {!compact && (
        <Text
          style={{
            color,
            fontSize: 30,
            fontWeight: "800",
            letterSpacing: -1.8,
            fontStyle: "italic",
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
  share: { position: "absolute", width: 20, height: 20, borderRadius: 6 },
});
