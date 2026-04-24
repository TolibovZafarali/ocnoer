import { useState } from "react";
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

type SignInScreenProps = {
  error: string | null;
  isSubmitting: boolean;
  onSignIn: (secret: string) => void;
};

export function SignInScreen(props: SignInScreenProps) {
  const [secret, setSecret] = useState("");
  const canSubmit = secret.trim().length > 0 && !props.isSubmitting;

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.container}
      >
        <View>
          <Text style={styles.eyebrow}>Ocnoer iOS</Text>
          <Text style={styles.title}>Player Sign In</Text>
          <Text style={styles.body}>
            Enter the player access credential from the existing Ocnoer player
            profile.
          </Text>

          <TextInput
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
            placeholderTextColor="#64748b"
            returnKeyType="go"
            secureTextEntry
            style={styles.input}
            value={secret}
          />

          {props.error ? <Text style={styles.error}>{props.error}</Text> : null}

          <Pressable
            accessibilityRole="button"
            disabled={!canSubmit}
            onPress={() => props.onSignIn(secret)}
            style={({ pressed }) => [
              styles.button,
              !canSubmit ? styles.buttonDisabled : null,
              pressed && canSubmit ? styles.buttonPressed : null
            ]}
          >
            {props.isSubmitting ? (
              <ActivityIndicator color="#021617" />
            ) : (
              <Text style={styles.buttonText}>Sign In</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#071014"
  },
  container: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24
  },
  eyebrow: {
    color: "#67e8f9",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
    marginBottom: 10,
    textTransform: "uppercase"
  },
  title: {
    color: "#f8fafc",
    fontSize: 34,
    fontWeight: "800",
    lineHeight: 40,
    marginBottom: 12
  },
  body: {
    color: "#cbd5e1",
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 22
  },
  input: {
    backgroundColor: "#102027",
    borderColor: "#284450",
    borderRadius: 8,
    borderWidth: 1,
    color: "#f8fafc",
    fontSize: 17,
    minHeight: 52,
    paddingHorizontal: 14
  },
  error: {
    color: "#fca5a5",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 12
  },
  button: {
    alignItems: "center",
    backgroundColor: "#14b8a6",
    borderRadius: 8,
    justifyContent: "center",
    marginTop: 18,
    minHeight: 50,
    paddingHorizontal: 18
  },
  buttonDisabled: {
    backgroundColor: "#334155"
  },
  buttonPressed: {
    opacity: 0.82
  },
  buttonText: {
    color: "#021617",
    fontSize: 16,
    fontWeight: "800"
  }
});
