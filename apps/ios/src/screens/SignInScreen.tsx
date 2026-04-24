import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";

import { OcnoerScreenBackground } from "../ui/primitives";
import { ocnoerTheme } from "../ui/theme";

type SignInScreenProps = {
  error: string | null;
  isSubmitting: boolean;
  onSignIn: (secret: string) => void;
};

export function SignInScreen(props: SignInScreenProps) {
  const inputRef = useRef<TextInput>(null);
  const [secret, setSecret] = useState("");
  const [expanded, setExpanded] = useState(false);
  const canSubmit = secret.trim().length > 0 && !props.isSubmitting;

  useEffect(() => {
    if (props.error) {
      setExpanded(true);
    }
  }, [props.error]);

  function focusInput() {
    setTimeout(() => {
      inputRef.current?.focus();
    }, 80);
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

  return (
    <SafeAreaView style={styles.safeArea}>
      <OcnoerScreenBackground>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.container}
        >
          <View style={styles.gateWrap}>
            <View
              style={[
                styles.gatePill,
                expanded ? styles.gatePillExpanded : styles.gatePillCollapsed,
                props.error ? styles.gatePillError : null
              ]}
            >
              {expanded ? (
                <TextInput
                  ref={inputRef}
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!props.isSubmitting}
                  onChangeText={setSecret}
                  onSubmitEditing={() => {
                    if (canSubmit) {
                      props.onSignIn(secret);
                    }
                  }}
                  placeholder="Player credential"
                  placeholderTextColor={ocnoerTheme.colors.textFaint}
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
                  pressed && !props.isSubmitting ? styles.pressed : null,
                  props.isSubmitting ? styles.disabled : null
                ]}
              >
                {props.isSubmitting ? (
                  <ActivityIndicator color={ocnoerTheme.colors.stageDeep} />
                ) : (
                  <Text style={styles.arrowText}>{">"}</Text>
                )}
              </Pressable>
            </View>

            {props.error ? (
              <Text style={styles.error}>{props.error}</Text>
            ) : null}
          </View>
        </KeyboardAvoidingView>
      </OcnoerScreenBackground>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: ocnoerTheme.colors.night,
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
    backgroundColor: "rgba(0, 0, 0, 0.36)",
    borderColor: ocnoerTheme.colors.border,
    borderRadius: ocnoerTheme.radii.pill,
    borderWidth: 1,
    flexDirection: "row",
    height: 72,
    overflow: "hidden",
    padding: ocnoerTheme.spacing.sm
  },
  gatePillExpanded: {
    maxWidth: 416,
    width: "100%"
  },
  gatePillCollapsed: {
    width: 72
  },
  gatePillError: {
    borderColor: "rgba(253, 164, 175, 0.36)"
  },
  input: {
    color: ocnoerTheme.colors.text,
    flex: 1,
    fontSize: 17,
    minWidth: 0,
    paddingHorizontal: ocnoerTheme.spacing.lg
  },
  arrowButton: {
    ...ocnoerTheme.shadows.glow,
    alignItems: "center",
    backgroundColor: ocnoerTheme.colors.text,
    borderRadius: ocnoerTheme.radii.pill,
    height: 56,
    justifyContent: "center",
    width: 56
  },
  arrowText: {
    color: ocnoerTheme.colors.stageDeep,
    fontSize: 24,
    fontWeight: "900",
    lineHeight: 28
  },
  error: {
    color: ocnoerTheme.colors.rose,
    fontSize: 14,
    lineHeight: 20,
    marginTop: ocnoerTheme.spacing.lg,
    maxWidth: 360,
    textAlign: "center"
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
