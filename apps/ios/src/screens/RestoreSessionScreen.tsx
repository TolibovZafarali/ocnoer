import {
  ActivityIndicator,
  SafeAreaView,
  StyleSheet,
  Text,
  View
} from "react-native";

export function RestoreSessionScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.centered}>
        <ActivityIndicator color="#67e8f9" size="large" />
        <Text style={styles.text}>Restoring player session</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#071014"
  },
  centered: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 28
  },
  text: {
    color: "#dbeafe",
    fontSize: 17,
    marginTop: 18
  }
});
