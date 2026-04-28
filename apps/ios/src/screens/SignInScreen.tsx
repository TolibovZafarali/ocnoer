import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View
} from "react-native";

import { LoadingSpinner } from "../ui/LoadingSpinner";
import { ocnoerTheme, ocnoerWebPlayer } from "../ui/theme";

const loginBackgroundImage = require("../../../../lore/background.jpg");
const GATE_EXPANSION_DURATION_MS = 280;

type SignInScreenProps = {
  credentialError: string | null;
  isSubmitting: boolean;
  onSignIn: (secret: string) => void;
};

export function SignInScreen(props: SignInScreenProps) {
  const inputRef = useRef<TextInput>(null);
  const expansionProgress = useRef(new Animated.Value(0)).current;
  const { width: windowWidth } = useWindowDimensions();
  const [secret, setSecret] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [hasEditedSinceError, setHasEditedSinceError] = useState(false);
  const expandedPillWidth = Math.max(
    ocnoerWebPlayer.gate.collapsedPillSize,
    Math.min(
      windowWidth - ocnoerTheme.spacing.lg * 2,
      ocnoerWebPlayer.gate.expandedPillMaxWidth
    )
  );
  const gatePillWidth = expansionProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [
      ocnoerWebPlayer.gate.collapsedPillSize,
      expandedPillWidth
    ]
  });
  const inputOpacity = expansionProgress.interpolate({
    inputRange: [0, 0.45, 1],
    outputRange: [0, 0, 1]
  });
  const inputTranslateX = expansionProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [-12, 0]
  });
  const canSubmit = secret.trim().length > 0 && !props.isSubmitting;
  const showErrorState = Boolean(
    props.credentialError && !hasEditedSinceError
  );

  useEffect(() => {
    const animation = Animated.timing(expansionProgress, {
      duration: GATE_EXPANSION_DURATION_MS,
      easing: Easing.out(Easing.cubic),
      toValue: expanded ? 1 : 0,
      useNativeDriver: false
    });

    animation.start();

    return () => {
      animation.stop();
    };
  }, [expanded, expansionProgress]);

  useEffect(() => {
    if (props.credentialError) {
      setHasEditedSinceError(false);
      return;
    }
  }, [props.credentialError]);

  function focusInput() {
    setTimeout(() => {
      inputRef.current?.focus();
    }, 170);
  }

  function handleArrowPress() {
    if (!expanded) {
      setExpanded(true);
      focusInput();
      return;
    }

    if (canSubmit) {
      props.onSignIn(secret);
    }
  }

  function handleSecretChange(nextSecret: string) {
    setSecret(nextSecret);

    if (props.credentialError) {
      setHasEditedSinceError(true);
    }
  }

  return (
    <ImageBackground
      resizeMode="cover"
      source={loginBackgroundImage}
      style={styles.backgroundImage}
    >
      <View pointerEvents="none" style={styles.backgroundScrim} />
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.container}
        >
          <View style={styles.gateWrap}>
            <Animated.View
              style={[
                styles.gatePill,
                {
                  width: gatePillWidth
                },
                showErrorState ? styles.gatePillError : null
              ]}
            >
              {expanded ? (
                <Animated.View
                  style={[
                    styles.inputSlot,
                    {
                      opacity: inputOpacity,
                      transform: [
                        {
                          translateX: inputTranslateX
                        }
                      ]
                    }
                  ]}
                >
                  <TextInput
                    ref={inputRef}
                    accessibilityLabel="Password"
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!props.isSubmitting}
                    onChangeText={handleSecretChange}
                    onSubmitEditing={() => {
                      if (canSubmit) {
                        props.onSignIn(secret);
                      }
                    }}
                    returnKeyType="go"
                    secureTextEntry
                    selectionColor={ocnoerTheme.colors.text}
                    style={styles.input}
                    value={secret}
                  />
                </Animated.View>
              ) : null}

              <Pressable
                accessibilityLabel={
                  expanded ? "Submit credential" : "Open credential field"
                }
                accessibilityRole="button"
                disabled={props.isSubmitting}
                onPress={handleArrowPress}
                style={({ pressed }) => [
                  styles.arrowButton,
                  showErrorState ? styles.arrowButtonError : null,
                  pressed && !props.isSubmitting ? styles.pressed : null,
                  props.isSubmitting ? styles.disabled : null
                ]}
              >
                {props.isSubmitting ? (
                  <LoadingSpinner
                    accessibilityLabel="Submitting credential"
                    size={24}
                    tintColor={ocnoerTheme.colors.stageDeep}
                  />
                ) : (
                  <Text
                    style={[
                      styles.arrowText,
                      showErrorState ? styles.arrowTextError : null
                    ]}
                  >
                    {"\u2192"}
                  </Text>
                )}
              </Pressable>
            </Animated.View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  backgroundImage: {
    flex: 1
  },
  backgroundScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.38)"
  },
  safeArea: {
    flex: 1
  },
  container: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: ocnoerTheme.spacing.lg
  },
  gateWrap: {
    alignItems: "center",
    width: "100%"
  },
  gatePill: {
    ...ocnoerTheme.shadows.card,
    alignItems: "center",
    backgroundColor: ocnoerWebPlayer.gate.pillBackground,
    borderColor: ocnoerWebPlayer.gate.pillBorder,
    borderRadius: ocnoerTheme.radii.pill,
    borderWidth: 1,
    flexDirection: "row",
    height: ocnoerWebPlayer.gate.collapsedPillSize,
    overflow: "hidden",
    padding: ocnoerTheme.spacing.sm
  },
  gatePillError: {
    borderColor: "#7f1d1d"
  },
  inputSlot: {
    flex: 1,
    height: "100%",
    minWidth: 0
  },
  input: {
    color: ocnoerTheme.colors.text,
    fontSize: 16,
    height: "100%",
    minWidth: 0,
    paddingHorizontal: ocnoerTheme.spacing.lg,
    width: "100%"
  },
  arrowButton: {
    ...ocnoerTheme.shadows.glow,
    alignItems: "center",
    backgroundColor: ocnoerWebPlayer.gate.arrowBackground,
    borderRadius: ocnoerTheme.radii.pill,
    flexShrink: 0,
    height: 56,
    justifyContent: "center",
    width: 56
  },
  arrowButtonError: {
    backgroundColor: "#7f1d1d"
  },
  arrowText: {
    color: ocnoerWebPlayer.gate.arrowColor,
    fontSize: 25,
    fontWeight: "900",
    lineHeight: 28
  },
  arrowTextError: {
    color: ocnoerTheme.colors.text
  },
  pressed: {
    opacity: ocnoerTheme.opacity.pressed,
    transform: [
      {
        scale: 0.98
      }
    ]
  },
  disabled: {
    opacity: ocnoerTheme.opacity.disabled
  }
});
