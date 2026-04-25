import { useEffect, useRef, type ReactNode } from "react";
import {
  Animated,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle
} from "react-native";

import { ocnoerTheme, ocnoerWebPlayer } from "../../ui/theme";

export function FadeInView(props: {
  animationKey: string;
  children: ReactNode;
  durationMs?: number;
  pointerEvents?: "auto" | "box-none" | "box-only" | "none";
  style?: StyleProp<ViewStyle>;
}) {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    opacity.setValue(0);
    const animation = Animated.timing(opacity, {
      toValue: 1,
      duration: props.durationMs ?? ocnoerTheme.motion.normalMs,
      useNativeDriver: true
    });

    animation.start();

    return () => {
      animation.stop();
    };
  }, [opacity, props.animationKey, props.durationMs]);

  return (
    <Animated.View
      pointerEvents={props.pointerEvents}
      style={[props.style, { opacity }]}
    >
      {props.children}
    </Animated.View>
  );
}

export function BlackoutOverlay(props: {
  visible: boolean;
  opacity?: number;
  pointerEvents?: "auto" | "none";
}) {
  if (!props.visible) {
    return null;
  }

  return (
    <View
      pointerEvents={props.pointerEvents ?? "none"}
      style={[
        styles.blackout,
        {
          opacity: props.opacity ?? 1
        }
      ]}
    />
  );
}

export function StageScrims() {
  return (
    <>
      <View pointerEvents="none" style={styles.sceneTint} />
      <View pointerEvents="none" style={styles.topScrim} />
      <View pointerEvents="none" style={styles.bottomScrim} />
    </>
  );
}

const styles = StyleSheet.create({
  blackout: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: ocnoerTheme.colors.black,
    zIndex: 16
  },
  sceneTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(2, 6, 17, 0.18)"
  },
  topScrim: {
    backgroundColor: "rgba(2, 6, 17, 0.08)",
    height: "22%",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0
  },
  bottomScrim: {
    backgroundColor: ocnoerWebPlayer.stage.overlayBottom,
    bottom: 0,
    height: "46%",
    left: 0,
    position: "absolute",
    right: 0
  }
});
