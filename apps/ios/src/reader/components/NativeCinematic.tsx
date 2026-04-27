import { useEffect, useRef, type ReactNode } from "react";
import {
  Animated,
  Easing,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle
} from "react-native";

import { ocnoerTheme } from "../../ui/theme";

export type NativeMotionDirection = "from-left" | "from-right" | "from-bottom";

const DEFAULT_DIRECTIONAL_TRAVEL = 48;

function getMotionOffset(input: {
  direction: NativeMotionDirection;
  travel: number;
}) {
  if (input.direction === "from-left") {
    return {
      x: -input.travel,
      y: 0
    };
  }

  if (input.direction === "from-right") {
    return {
      x: input.travel,
      y: 0
    };
  }

  return {
    x: 0,
    y: input.travel
  };
}

export function FadeInView(props: {
  animationKey: string;
  children: ReactNode;
  durationMs?: number;
  pointerEvents?: "auto" | "box-none" | "box-only" | "none";
  style?: StyleProp<ViewStyle>;
}) {
  const opacity = useRef(new Animated.Value(0)).current;

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

export function DirectionalSlideView(props: {
  animationKey: string;
  children: ReactNode;
  direction: NativeMotionDirection;
  enterDurationMs?: number;
  exitDurationMs?: number;
  isExiting?: boolean;
  pointerEvents?: "auto" | "box-none" | "box-only" | "none";
  style?: StyleProp<ViewStyle>;
  travel?: number;
}) {
  const progress = useRef(new Animated.Value(0)).current;
  const animationKeyRef = useRef(props.animationKey);
  const offset = getMotionOffset({
    direction: props.direction,
    travel: props.travel ?? DEFAULT_DIRECTIONAL_TRAVEL
  });
  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [offset.x, 0]
  });
  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [offset.y, 0]
  });

  useEffect(() => {
    if (animationKeyRef.current !== props.animationKey) {
      animationKeyRef.current = props.animationKey;
      progress.setValue(0);
    }

    const animation = Animated.timing(progress, {
      toValue: props.isExiting ? 0 : 1,
      duration: props.isExiting
        ? (props.exitDurationMs ?? ocnoerTheme.motion.lineExitMs)
        : (props.enterDurationMs ?? ocnoerTheme.motion.normalMs),
      easing: props.isExiting
        ? Easing.in(Easing.cubic)
        : Easing.out(Easing.cubic),
      useNativeDriver: true
    });

    animation.start();

    return () => {
      animation.stop();
    };
  }, [
    progress,
    props.animationKey,
    props.enterDurationMs,
    props.exitDurationMs,
    props.isExiting
  ]);

  return (
    <Animated.View
      pointerEvents={props.pointerEvents}
      style={[
        props.style,
        {
          opacity: progress,
          transform: [{ translateX }, { translateY }]
        }
      ]}
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
    <View pointerEvents="none" style={styles.sceneTint} />
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
  }
});
