import { StatusBar } from "expo-status-bar";
import { SafeAreaView, StyleSheet, Text, View } from "react-native";

import { STORY_SCHEMA_VERSION } from "@ocnoer/story-core";

export default function App() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={styles.container}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>iOS scaffold</Text>
        </View>

        <Text style={styles.title}>Ocnoer iOS Player</Text>
        <Text style={styles.body}>
          This is the placeholder Expo app shell for the Ocnoer iOS player.
        </Text>
        <Text style={styles.note}>
          The real player reader will be ported from the web app in later steps.
          Shared story contracts are wired through story-core schema version{" "}
          {STORY_SCHEMA_VERSION}.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#05070f"
  },
  container: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 28
  },
  badge: {
    alignSelf: "flex-start",
    borderColor: "rgba(255,255,255,0.16)",
    borderRadius: 999,
    borderWidth: 1,
    marginBottom: 20,
    paddingHorizontal: 12,
    paddingVertical: 6
  },
  badgeText: {
    color: "#cbd5e1",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase"
  },
  title: {
    color: "#f8fafc",
    fontSize: 34,
    fontWeight: "700",
    lineHeight: 40,
    marginBottom: 14
  },
  body: {
    color: "#dbeafe",
    fontSize: 18,
    lineHeight: 27,
    marginBottom: 14
  },
  note: {
    color: "#94a3b8",
    fontSize: 15,
    lineHeight: 23
  }
});
