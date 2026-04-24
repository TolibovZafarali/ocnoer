import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";

import type { RuntimeChapterBundle, RuntimeManifest } from "@ocnoer/story-core";

import type { MobileRuntimeConfig } from "../config/runtime";
import { createChapterPreview, type ChapterPreview } from "../runtime/preview";
import { createMobileRuntimeRepository } from "../runtime/runtimeRepository";

type ChapterPreviewState =
  | {
      status: "loading";
    }
  | {
      status: "error";
      message: string;
    }
  | {
      status: "success";
      bundle: RuntimeChapterBundle;
      preview: ChapterPreview;
    };

type ChapterPreviewScreenProps = {
  config: MobileRuntimeConfig;
  manifest: RuntimeManifest;
  chapterId: string;
  onBack: () => void;
};

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Unable to load the chapter bundle.";
}

function SecondaryButton(props: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.secondaryButton,
        pressed ? styles.secondaryButtonPressed : null
      ]}
    >
      <Text style={styles.secondaryButtonText}>{props.label}</Text>
    </Pressable>
  );
}

function DialogueLine(props: { speaker: string; text: string }) {
  return (
    <View style={styles.line}>
      <Text style={styles.speaker}>{props.speaker}</Text>
      <Text style={styles.dialogue}>{props.text}</Text>
    </View>
  );
}

export function ChapterPreviewScreen(props: ChapterPreviewScreenProps) {
  const [state, setState] = useState<ChapterPreviewState>({
    status: "loading"
  });
  const mountedRef = useRef(true);
  const repository = useMemo(
    () => createMobileRuntimeRepository(props.config),
    [props.config]
  );
  const setPreviewState = useCallback((nextState: ChapterPreviewState) => {
    if (mountedRef.current) {
      setState(nextState);
    }
  }, []);
  const loadPreview = useCallback(async () => {
    setPreviewState({
      status: "loading"
    });

    try {
      const bundle = await repository.loadChapter(
        props.manifest,
        props.chapterId
      );

      setPreviewState({
        status: "success",
        bundle,
        preview: createChapterPreview(bundle)
      });
    } catch (error) {
      setPreviewState({
        status: "error",
        message: getErrorMessage(error)
      });
    }
  }, [props.chapterId, props.manifest, repository, setPreviewState]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    void loadPreview();
  }, [loadPreview]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <SecondaryButton label="Back" onPress={props.onBack} />

        {state.status === "loading" ? (
          <View style={styles.centeredPanel}>
            <ActivityIndicator color="#facc15" size="large" />
            <Text style={styles.loadingText}>Loading chapter bundle</Text>
          </View>
        ) : null}

        {state.status === "error" ? (
          <View style={styles.panel}>
            <Text style={styles.title}>Chapter load failed</Text>
            <Text style={styles.body}>{state.message}</Text>
            <SecondaryButton label="Retry" onPress={loadPreview} />
          </View>
        ) : null}

        {state.status === "success" ? (
          <View>
            <Text style={styles.eyebrow}>Chapter Preview</Text>
            <Text style={styles.title}>{state.preview.chapterTitle}</Text>

            <View style={styles.panel}>
              <Text style={styles.metaLabel}>Chapter id</Text>
              <Text style={styles.metaValue}>{state.preview.chapterId}</Text>
              <Text style={styles.metaLabel}>Scene</Text>
              <Text style={styles.metaValue}>
                {state.preview.sceneTitle ?? "Untitled scene"}
              </Text>
              <Text style={styles.metaLabel}>Scene id</Text>
              <Text style={styles.metaValue}>
                {state.preview.sceneId ?? "Unavailable"}
              </Text>
              <Text style={styles.metaLabel}>Scene count</Text>
              <Text style={styles.metaValue}>
                {String(state.bundle.chapter.scenes.length)}
              </Text>
            </View>

            <View style={styles.dialoguePanel}>
              {state.preview.lines.length > 0 ? (
                state.preview.lines.map((line) => (
                  <DialogueLine
                    key={line.id}
                    speaker={line.speaker}
                    text={line.text}
                  />
                ))
              ) : (
                <Text style={styles.body}>No dialogue entries found.</Text>
              )}
            </View>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#0e1116"
  },
  content: {
    padding: 24,
    paddingBottom: 42
  },
  centeredPanel: {
    alignItems: "center",
    backgroundColor: "#171d26",
    borderColor: "#303b4a",
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 20,
    padding: 24
  },
  eyebrow: {
    color: "#facc15",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
    marginBottom: 10,
    marginTop: 22,
    textTransform: "uppercase"
  },
  title: {
    color: "#f8fafc",
    fontSize: 31,
    fontWeight: "800",
    lineHeight: 37,
    marginBottom: 16
  },
  body: {
    color: "#cbd5e1",
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 16
  },
  loadingText: {
    color: "#e2e8f0",
    fontSize: 16,
    marginTop: 14
  },
  panel: {
    backgroundColor: "#171d26",
    borderColor: "#303b4a",
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 16,
    padding: 16
  },
  metaLabel: {
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.7,
    marginBottom: 3,
    marginTop: 10,
    textTransform: "uppercase"
  },
  metaValue: {
    color: "#f8fafc",
    fontSize: 16,
    lineHeight: 23
  },
  dialoguePanel: {
    marginTop: 2
  },
  line: {
    backgroundColor: "#161f2b",
    borderColor: "#2e4055",
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 12,
    padding: 14
  },
  speaker: {
    color: "#facc15",
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 6,
    textTransform: "uppercase"
  },
  dialogue: {
    color: "#f8fafc",
    fontSize: 17,
    lineHeight: 25
  },
  secondaryButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderColor: "#475569",
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 42,
    justifyContent: "center",
    paddingHorizontal: 16
  },
  secondaryButtonPressed: {
    opacity: 0.75
  },
  secondaryButtonText: {
    color: "#e2e8f0",
    fontSize: 15,
    fontWeight: "700"
  }
});
