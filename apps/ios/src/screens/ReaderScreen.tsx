import { useEffect, useRef, type ReactNode } from "react";
import {
  ActivityIndicator,
  Animated,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";

import type { PlayerRuntimeBootstrap } from "@ocnoer/story-core";

import type { MobilePlayer } from "../api/playerSessionTypes";
import type { MobileRuntimeConfig } from "../config/runtime";
import type { NativeReaderBoundaryPresentation } from "../reader/boundaryPresentation";
import { useReaderImagePreload } from "../reader/imagePreload";
import type {
  NativeReaderDressOption,
  NativeReaderPortrait,
  NativeReaderPresentation
} from "../reader/readerPresentation";
import { useNativeReaderController } from "../reader/useNativeReaderController";

type ReaderScreenProps = {
  bootstrap: PlayerRuntimeBootstrap;
  config: MobileRuntimeConfig;
  player: MobilePlayer;
  onBackHome: () => void;
  onProgressSaved: () => void;
  onUpdateCatName: (catName: string) => Promise<void>;
};

function PrimaryButton(props: {
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={props.disabled}
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        props.disabled ? styles.buttonDisabled : null,
        pressed && !props.disabled ? styles.buttonPressed : null
      ]}
    >
      <Text style={styles.primaryButtonText}>{props.label}</Text>
    </Pressable>
  );
}

function SecondaryButton(props: {
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={props.disabled}
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.secondaryButton,
        props.disabled ? styles.secondaryButtonDisabled : null,
        pressed && !props.disabled ? styles.buttonPressed : null
      ]}
    >
      <Text style={styles.secondaryButtonText}>{props.label}</Text>
    </Pressable>
  );
}

function FadeInView(props: {
  animationKey: string;
  children: ReactNode;
  durationMs?: number;
  style?: object;
}) {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    opacity.setValue(0);
    const animation = Animated.timing(opacity, {
      toValue: 1,
      duration: props.durationMs ?? 180,
      useNativeDriver: true
    });

    animation.start();

    return () => {
      animation.stop();
    };
  }, [opacity, props.animationKey, props.durationMs]);

  return (
    <Animated.View style={[props.style, { opacity }]}>
      {props.children}
    </Animated.View>
  );
}

function ReaderHeader(props: {
  title: string;
  subtitle: string;
  onBackHome: () => void;
}) {
  return (
    <View style={styles.header}>
      <SecondaryButton label="Home" onPress={props.onBackHome} />
      <View style={styles.headerText}>
        <Text numberOfLines={1} style={styles.headerTitle}>
          {props.title}
        </Text>
        <Text numberOfLines={1} style={styles.headerSubtitle}>
          {props.subtitle}
        </Text>
      </View>
    </View>
  );
}

function Portrait(props: { portrait: NativeReaderPortrait | null }) {
  if (!props.portrait) {
    return <View style={styles.portraitSlot} />;
  }

  return (
    <View
      style={[
        styles.portraitSlot,
        props.portrait.side === "left"
          ? styles.portraitSlotLeft
          : styles.portraitSlotRight
      ]}
    >
      <FadeInView animationKey={props.portrait.key} style={styles.portraitFade}>
        <Image
          accessibilityIgnoresInvertColors
          accessibilityLabel={props.portrait.label}
          resizeMode="contain"
          source={{ uri: props.portrait.imageUrl }}
          style={[
            styles.portraitImage,
            props.portrait.isActiveSpeaker
              ? styles.portraitImageActive
              : styles.portraitImageInactive
          ]}
        />
      </FadeInView>
    </View>
  );
}

function ReaderStage(props: { presentation: NativeReaderPresentation }) {
  return (
    <View style={styles.stage}>
      {props.presentation.backgroundImageUrl ? (
        <FadeInView
          animationKey={props.presentation.backgroundImageUrl}
          durationMs={260}
          style={styles.stageBackgroundFade}
        >
          <Image
            accessibilityIgnoresInvertColors
            resizeMode="cover"
            source={{ uri: props.presentation.backgroundImageUrl }}
            style={styles.stageBackground}
          />
        </FadeInView>
      ) : null}
      <View style={styles.stageOverlay} />
      <View style={styles.sceneBadge}>
        <Text numberOfLines={1} style={styles.sceneBadgeText}>
          {props.presentation.sceneTitle}
        </Text>
      </View>
      <View style={styles.portraitRow}>
        <Portrait portrait={props.presentation.leftPortrait} />
        <Portrait portrait={props.presentation.rightPortrait} />
      </View>
    </View>
  );
}

function DressOption(props: {
  option: NativeReaderDressOption;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.dressOption,
        props.selected ? styles.dressOptionSelected : null,
        pressed ? styles.buttonPressed : null
      ]}
    >
      {props.option.previewImageUrl ? (
        <Image
          accessibilityIgnoresInvertColors
          resizeMode="contain"
          source={{ uri: props.option.previewImageUrl }}
          style={styles.dressPreview}
        />
      ) : (
        <View style={styles.emptyDressPreview} />
      )}
      <Text numberOfLines={2} style={styles.dressOptionText}>
        {props.option.label}
      </Text>
    </Pressable>
  );
}

function ReaderDialogue(props: {
  presentation: NativeReaderPresentation;
  actionError: string | null;
  persistenceError: string | null;
  catNameInputValue: string;
  catNameInputError: string | null;
  isSavingCatName: boolean;
  isMoving: boolean;
  canRetreat: boolean;
  onAdvance: () => void;
  onRetreat: () => void;
  onSelectDressOption: (optionKey: string) => void;
  onSubmitCatName: () => void;
  onCatNameInputChange: (value: string) => void;
}) {
  if (props.presentation.status === "unsupported") {
    return (
      <View style={styles.dialoguePanel}>
        <Text style={styles.unsupportedTitle}>Unsupported Story Entry</Text>
        <Text style={styles.body}>{props.presentation.message}</Text>
        <Text style={styles.metaText}>
          Entry {props.presentation.dialogueEntryId}
        </Text>
        <ReaderActions
          canAdvance={false}
          canRetreat={props.canRetreat}
          isMoving={props.isMoving}
          onAdvance={props.onAdvance}
          onRetreat={props.onRetreat}
        />
      </View>
    );
  }

  const canAdvance =
    !props.presentation.needsCatNameInput &&
    !props.presentation.needsDressSelection &&
    !props.isMoving;
  const selectedDressOptionKey = props.presentation.selectedDressOptionKey;

  return (
    <View style={styles.dialoguePanel}>
      <Text style={styles.speaker}>{props.presentation.speakerName}</Text>
      {props.presentation.dialogueText.length > 0 ? (
        <Text style={styles.dialogueText}>
          {props.presentation.dialogueText}
        </Text>
      ) : null}

      {props.presentation.needsCatNameInput ? (
        <View style={styles.promptBlock}>
          <Text style={styles.promptTitle}>Cat Name</Text>
          <TextInput
            autoCapitalize="words"
            editable={!props.isSavingCatName}
            onChangeText={props.onCatNameInputChange}
            onSubmitEditing={props.onSubmitCatName}
            placeholder="Enter cat name"
            placeholderTextColor="#64748b"
            returnKeyType="done"
            style={styles.input}
            value={props.catNameInputValue}
          />
          {props.catNameInputError ? (
            <Text style={styles.errorText}>{props.catNameInputError}</Text>
          ) : null}
          <PrimaryButton
            disabled={props.isSavingCatName}
            label={props.isSavingCatName ? "Saving" : "Save Name"}
            onPress={props.onSubmitCatName}
          />
        </View>
      ) : null}

      {props.presentation.dressOptions.length > 0 ? (
        <View style={styles.promptBlock}>
          <Text style={styles.promptTitle}>Choose Outfit</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.dressScroll}
          >
            {props.presentation.dressOptions.map((option) => (
              <DressOption
                key={option.key}
                option={option}
                selected={option.key === selectedDressOptionKey}
                onPress={() => props.onSelectDressOption(option.key)}
              />
            ))}
          </ScrollView>
        </View>
      ) : null}

      {props.actionError ? (
        <Text style={styles.errorText}>{props.actionError}</Text>
      ) : null}
      {props.persistenceError ? (
        <Text style={styles.warningText}>{props.persistenceError}</Text>
      ) : null}

      <ReaderActions
        canAdvance={canAdvance}
        canRetreat={props.canRetreat}
        isMoving={props.isMoving}
        onAdvance={props.onAdvance}
        onRetreat={props.onRetreat}
      />
    </View>
  );
}

function ReaderBoundaryCard(props: {
  boundary: NativeReaderBoundaryPresentation;
  actionError: string | null;
  persistenceError: string | null;
  isMoving: boolean;
  canRetreat: boolean;
  onAdvance: () => void;
  onRetreat: () => void;
}) {
  const canAdvance =
    props.boundary.primaryActionLabel != null && !props.isMoving;

  return (
    <FadeInView
      animationKey={`${props.boundary.type}:${props.boundary.title}:${props.boundary.body}`}
      durationMs={220}
      style={styles.boundaryPanel}
    >
      <Text style={styles.boundaryEyebrow}>{props.boundary.eyebrow}</Text>
      <Text style={styles.boundaryTitle}>{props.boundary.title}</Text>
      {props.boundary.meta ? (
        <Text style={styles.boundaryMeta}>{props.boundary.meta}</Text>
      ) : null}
      <Text style={styles.boundaryBody}>{props.boundary.body}</Text>

      {props.actionError ? (
        <Text style={styles.errorText}>{props.actionError}</Text>
      ) : null}
      {props.persistenceError ? (
        <Text style={styles.warningText}>{props.persistenceError}</Text>
      ) : null}

      <View style={styles.actions}>
        <SecondaryButton
          disabled={!props.canRetreat || props.isMoving}
          label="Back"
          onPress={props.onRetreat}
        />
        <View style={styles.actionSpacer} />
        {props.boundary.primaryActionLabel ? (
          <PrimaryButton
            disabled={!canAdvance}
            label={
              props.isMoving ? "Loading" : props.boundary.primaryActionLabel
            }
            onPress={props.onAdvance}
          />
        ) : null}
      </View>
    </FadeInView>
  );
}

function ReaderActions(props: {
  canAdvance: boolean;
  canRetreat: boolean;
  isMoving: boolean;
  onAdvance: () => void;
  onRetreat: () => void;
}) {
  return (
    <View style={styles.actions}>
      <SecondaryButton
        disabled={!props.canRetreat || props.isMoving}
        label="Back"
        onPress={props.onRetreat}
      />
      <View style={styles.actionSpacer} />
      <PrimaryButton
        disabled={!props.canAdvance || props.isMoving}
        label={props.isMoving ? "Loading" : "Next"}
        onPress={props.onAdvance}
      />
    </View>
  );
}

export function ReaderScreen(props: ReaderScreenProps) {
  const reader = useNativeReaderController({
    bootstrap: props.bootstrap,
    config: props.config,
    player: props.player,
    onProgressSaved: props.onProgressSaved,
    onUpdateCatName: props.onUpdateCatName
  });
  const presentation = reader.presentation;
  const boundaryPresentation = reader.boundaryPresentation;

  useReaderImagePreload(reader.preloadImageUrls);

  if (reader.state.status === "loading") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <ActivityIndicator color="#67e8f9" size="large" />
          <Text style={styles.loadingText}>Loading reader</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (reader.state.status === "error") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <ReaderHeader
            title="Reader"
            subtitle="Load failed"
            onBackHome={props.onBackHome}
          />
          <View style={styles.messagePanel}>
            <Text style={styles.messageTitle}>Reader Load Failed</Text>
            <Text style={styles.body}>{reader.state.message}</Text>
            <PrimaryButton label="Retry" onPress={reader.reload} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (reader.state.status === "unavailable") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <ReaderHeader
            title="Reader"
            subtitle="Story unavailable"
            onBackHome={props.onBackHome}
          />
          <View style={styles.messagePanel}>
            <Text style={styles.messageTitle}>No Playable Story</Text>
            <Text style={styles.body}>{reader.state.message}</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (!presentation) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <ReaderHeader
            title="Reader"
            subtitle="Position unavailable"
            onBackHome={props.onBackHome}
          />
          <View style={styles.messagePanel}>
            <Text style={styles.messageTitle}>Story Position Missing</Text>
            <Text style={styles.body}>
              The current chapter or dialogue entry could not be resolved.
            </Text>
            <PrimaryButton label="Retry" onPress={reader.reload} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (boundaryPresentation) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.content}
        >
          <ReaderHeader
            title={presentation.chapterTitle}
            subtitle={boundaryPresentation.eyebrow}
            onBackHome={props.onBackHome}
          />
          <ReaderBoundaryCard
            actionError={reader.actionError}
            boundary={boundaryPresentation}
            canRetreat={reader.canRetreat}
            isMoving={reader.isMoving}
            persistenceError={reader.persistenceError}
            onAdvance={reader.advance}
            onRetreat={reader.retreat}
          />
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  if (reader.state.status === "finished") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <ReaderHeader
            title={presentation.chapterTitle}
            subtitle="Story complete"
            onBackHome={props.onBackHome}
          />
          <ReaderStage presentation={presentation} />
          <View style={styles.dialoguePanel}>
            <Text style={styles.messageTitle}>Story Finished</Text>
            <Text style={styles.body}>
              You have reached the end of the currently published story.
            </Text>
            <SecondaryButton
              disabled={reader.isMoving}
              label="Back"
              onPress={reader.retreat}
            />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.content}
      >
        <ReaderHeader
          title={presentation.chapterTitle}
          subtitle={`Scene ${presentation.sceneIndex + 1}/${presentation.sceneCount} - Line ${presentation.dialogueIndex + 1}/${presentation.dialogueCount}`}
          onBackHome={props.onBackHome}
        />
        <ReaderStage presentation={presentation} />
        <FadeInView
          animationKey={`${presentation.status}:${presentation.dialogueEntryId}`}
          durationMs={160}
        >
          <ReaderDialogue
            actionError={reader.actionError}
            canRetreat={reader.canRetreat}
            catNameInputError={reader.catNameInputError}
            catNameInputValue={reader.catNameInputValue}
            isMoving={reader.isMoving}
            isSavingCatName={reader.isSavingCatName}
            persistenceError={reader.persistenceError}
            presentation={presentation}
            onAdvance={reader.advance}
            onCatNameInputChange={reader.setCatNameInputValue}
            onRetreat={reader.retreat}
            onSelectDressOption={reader.selectDressOption}
            onSubmitCatName={reader.submitCatName}
          />
        </FadeInView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#070a0f"
  },
  content: {
    flex: 1,
    padding: 14
  },
  centered: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 28
  },
  loadingText: {
    color: "#dbeafe",
    fontSize: 17,
    marginTop: 18
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    minHeight: 48
  },
  headerText: {
    flex: 1,
    marginLeft: 12
  },
  headerTitle: {
    color: "#f8fafc",
    fontSize: 17,
    fontWeight: "800"
  },
  headerSubtitle: {
    color: "#94a3b8",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2
  },
  stage: {
    backgroundColor: "#111827",
    borderColor: "#273244",
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    marginTop: 12,
    minHeight: 280,
    overflow: "hidden"
  },
  stageBackground: {
    ...StyleSheet.absoluteFillObject
  },
  stageBackgroundFade: {
    ...StyleSheet.absoluteFillObject
  },
  stageOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(2, 6, 23, 0.30)"
  },
  sceneBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(2, 6, 23, 0.70)",
    borderColor: "rgba(148, 163, 184, 0.28)",
    borderRadius: 8,
    borderWidth: 1,
    margin: 12,
    maxWidth: "88%",
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  sceneBadgeText: {
    color: "#e2e8f0",
    fontSize: 12,
    fontWeight: "800"
  },
  portraitRow: {
    alignItems: "flex-end",
    bottom: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    left: 0,
    paddingHorizontal: 10,
    position: "absolute",
    right: 0,
    top: 50
  },
  portraitSlot: {
    alignItems: "center",
    flex: 1,
    height: "100%",
    justifyContent: "flex-end"
  },
  portraitSlotLeft: {
    alignItems: "flex-start"
  },
  portraitSlotRight: {
    alignItems: "flex-end"
  },
  portraitFade: {
    alignItems: "center",
    height: "100%",
    justifyContent: "flex-end",
    width: "100%"
  },
  portraitImage: {
    height: "96%",
    maxWidth: 210,
    width: "100%"
  },
  portraitImageActive: {
    opacity: 1,
    transform: [{ scale: 1.03 }]
  },
  portraitImageInactive: {
    opacity: 0.78,
    transform: [{ scale: 0.98 }]
  },
  dialoguePanel: {
    backgroundColor: "#111827",
    borderColor: "#273244",
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 12,
    padding: 16
  },
  boundaryPanel: {
    backgroundColor: "#0b1220",
    borderColor: "#273244",
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    marginTop: 12,
    padding: 20
  },
  boundaryEyebrow: {
    color: "#67e8f9",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.8,
    marginBottom: 12,
    textTransform: "uppercase"
  },
  boundaryTitle: {
    color: "#f8fafc",
    fontSize: 28,
    fontWeight: "900",
    lineHeight: 34,
    marginBottom: 10
  },
  boundaryMeta: {
    color: "#94a3b8",
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 14,
    textTransform: "uppercase"
  },
  boundaryBody: {
    color: "#dbeafe",
    fontSize: 19,
    lineHeight: 29
  },
  speaker: {
    color: "#facc15",
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.6,
    marginBottom: 8,
    textTransform: "uppercase"
  },
  dialogueText: {
    color: "#f8fafc",
    fontSize: 18,
    lineHeight: 27
  },
  promptBlock: {
    marginTop: 14
  },
  promptTitle: {
    color: "#cbd5e1",
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 8,
    textTransform: "uppercase"
  },
  input: {
    backgroundColor: "#070a0f",
    borderColor: "#334155",
    borderRadius: 8,
    borderWidth: 1,
    color: "#f8fafc",
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: 12
  },
  dressScroll: {
    marginHorizontal: -4
  },
  dressOption: {
    alignItems: "center",
    backgroundColor: "#0b1220",
    borderColor: "#334155",
    borderRadius: 8,
    borderWidth: 1,
    marginHorizontal: 4,
    minHeight: 132,
    padding: 8,
    width: 112
  },
  dressOptionSelected: {
    backgroundColor: "#12333b",
    borderColor: "#67e8f9"
  },
  dressPreview: {
    height: 86,
    width: "100%"
  },
  emptyDressPreview: {
    backgroundColor: "#1f2937",
    borderRadius: 6,
    height: 86,
    width: "100%"
  },
  dressOptionText: {
    color: "#f8fafc",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 16,
    marginTop: 8,
    textAlign: "center"
  },
  actions: {
    flexDirection: "row",
    marginTop: 16
  },
  actionSpacer: {
    width: 10
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#14b8a6",
    borderRadius: 8,
    justifyContent: "center",
    minHeight: 46,
    paddingHorizontal: 16
  },
  primaryButtonText: {
    color: "#021617",
    fontSize: 15,
    fontWeight: "900"
  },
  secondaryButton: {
    alignItems: "center",
    borderColor: "#475569",
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 42,
    paddingHorizontal: 14
  },
  secondaryButtonText: {
    color: "#e2e8f0",
    fontSize: 14,
    fontWeight: "800"
  },
  secondaryButtonDisabled: {
    opacity: 0.45
  },
  buttonDisabled: {
    backgroundColor: "#334155",
    opacity: 0.72
  },
  buttonPressed: {
    opacity: 0.78
  },
  errorText: {
    color: "#fca5a5",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 10
  },
  warningText: {
    color: "#fde68a",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 10
  },
  messagePanel: {
    backgroundColor: "#111827",
    borderColor: "#273244",
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 18,
    padding: 16
  },
  messageTitle: {
    color: "#f8fafc",
    fontSize: 23,
    fontWeight: "900",
    lineHeight: 29,
    marginBottom: 10
  },
  unsupportedTitle: {
    color: "#fca5a5",
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 8
  },
  body: {
    color: "#cbd5e1",
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 16
  },
  metaText: {
    color: "#94a3b8",
    fontSize: 12,
    lineHeight: 18
  }
});
