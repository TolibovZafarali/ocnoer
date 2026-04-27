import { useEffect, useRef, useState } from "react";
import {
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";

import { LoadingSpinner } from "../ui/LoadingSpinner";
import { ocnoerTheme, ocnoerWebPlayer } from "../ui/theme";

const loginBackgroundImage = require("../../../../lore/background.jpg");

type SignInScreenProps = {
  error: string | null;
  isSubmitting: boolean;
  onSignIn: (secret: string) => void;
};

export function SignInScreen(props: SignInScreenProps) {
  const inputRef = useRef<TextInput>(null);
  const [secret, setSecret] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [hasEditedSinceError, setHasEditedSinceError] = useState(false);
  const canSubmit = secret.trim().length > 0 && !props.isSubmitting;
  const showErrorState = Boolean(props.error && !hasEditedSinceError);

  useEffect(() => {
    if (props.error) {
      setExpanded(true);
      setHasEditedSinceError(false);
      return;
    }
  }, [props.error]);

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

    if (props.error) {
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
            <View
              style={[
                styles.gatePill,
                expanded ? styles.gatePillExpanded : styles.gatePillCollapsed,
                showErrorState ? styles.gatePillError : null
              ]}
            >
              {expanded ? (
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
            </View>
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
  gatePillExpanded: {
    maxWidth: ocnoerWebPlayer.gate.expandedPillMaxWidth,
    width: "100%"
  },
  gatePillCollapsed: {
    justifyContent: "center",
    padding: 0,
    width: ocnoerWebPlayer.gate.collapsedPillSize
  },
  gatePillError: {
    borderColor: "#7f1d1d"
  },
  input: {
    color: ocnoerTheme.colors.text,
    flex: 1,
    fontSize: 16,
    minWidth: 0,
    paddingHorizontal: ocnoerTheme.spacing.lg
  },
  arrowButton: {
    ...ocnoerTheme.shadows.glow,
    alignItems: "center",
    backgroundColor: ocnoerWebPlayer.gate.arrowBackground,
    borderRadius: ocnoerTheme.radii.pill,
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
