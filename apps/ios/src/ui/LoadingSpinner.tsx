import { Image as ExpoImage } from "expo-image";
import { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  SafeAreaView,
  StyleSheet,
  View,
  type ImageStyle,
  type StyleProp
} from "react-native";

import { ocnoerTheme } from "./theme";

const loadingSpinnerSource = require("../../../../public/loading-spinner.svg");

type LoadingSpinnerProps = {
  accessibilityLabel?: string;
  size?: number;
  style?: StyleProp<ImageStyle>;
  tintColor?: string;
};

export function LoadingSpinner(props: LoadingSpinnerProps) {
  const size = props.size ?? 56;
  const rotateProgress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(rotateProgress, {
        duration: 1800,
        easing: Easing.linear,
        toValue: 1,
        useNativeDriver: true
      })
    );

    animation.start();

    return () => {
      animation.stop();
    };
  }, [rotateProgress]);

  const rotate = rotateProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"]
  });

  return (
    <Animated.View
      accessibilityLabel={props.accessibilityLabel ?? "Loading"}
      accessibilityRole="progressbar"
      accessible
      style={{
        height: size,
        transform: [{ rotate }],
        width: size
      }}
    >
      <ExpoImage
        contentFit="contain"
        source={loadingSpinnerSource}
        tintColor={props.tintColor}
        style={[
          styles.spinner,
          {
            height: size,
            width: size
          },
          props.style
        ]}
      />
    </Animated.View>
  );
}

export function OcnoerLoadingScreen(props: { accessibilityLabel?: string }) {
  return (
    <SafeAreaView style={styles.loadingScreen}>
      <View style={styles.loadingCenter}>
        <LoadingSpinner
          accessibilityLabel={props.accessibilityLabel}
          size={72}
          tintColor={ocnoerTheme.colors.text}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  loadingScreen: {
    backgroundColor: ocnoerTheme.colors.black,
    flex: 1
  },
  loadingCenter: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center"
  },
  spinner: {
    display: "flex"
  }
});
