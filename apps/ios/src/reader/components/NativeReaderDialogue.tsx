import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle
} from "react-native";
import { SvgUri } from "react-native-svg";

import type {
  NativeReaderDressOption,
  NativeReaderPresentation
} from "../readerPresentation";
import { OcnoerSurface, OcnoerTextInput } from "../../ui/primitives";
import { ocnoerTheme, ocnoerWebPlayer } from "../../ui/theme";
import {
  DirectionalSlideView,
  type NativeMotionDirection
} from "./NativeCinematic";

type ReaderDialogueProps = {
  presentation: NativeReaderPresentation;
  actionError: string | null;
  persistenceError: string | null;
  catNameInputValue: string;
  catNameInputError: string | null;
  isSavingCatName: boolean;
  isExiting: boolean;
  isMoving: boolean;
  onAdvance: () => void;
  onSelectDressOption: (optionKey: string) => void;
  onSubmitCatName: () => void;
  onCatNameInputChange: (value: string) => void;
};

function getDialogueCardPositionStyle(
  presentation: NativeReaderPresentation
): ViewStyle {
  if (presentation.dialogueCardPlacement === "speaker-left") {
    return {
      left: "48%",
      right: ocnoerWebPlayer.dialogueCard.sideInset
    };
  }

  if (presentation.dialogueCardPlacement === "speaker-right") {
    return {
      left: ocnoerWebPlayer.dialogueCard.sideInset,
      right: "48%"
    };
  }

  if (presentation.dialogueCardPlacement === "cat-name") {
    return {
      left: ocnoerWebPlayer.dialogueCard.sideInset,
      maxWidth: ocnoerWebPlayer.dialogueCard.catNameMaxWidth,
      width: "92%"
    };
  }

  return {
    left: ocnoerWebPlayer.dialogueCard.sideInset,
    right: ocnoerWebPlayer.dialogueCard.sideInset
  };
}

function getDialogueMotionDirection(
  presentation: NativeReaderPresentation
): NativeMotionDirection {
  if (presentation.dialogueCardPlacement === "speaker-left") {
    return "from-right";
  }

  if (presentation.dialogueCardPlacement === "speaker-right") {
    return "from-left";
  }

  return "from-bottom";
}

function shouldShowSpeakerLabel(presentation: NativeReaderPresentation) {
  return (
    presentation.status === "supported" &&
    (presentation.entryType === "character" ||
      presentation.entryType === "cat_name_prompt")
  );
}

function SpeakerLabel(props: { presentation: NativeReaderPresentation }) {
  if (props.presentation.status !== "supported") {
    return null;
  }

  if (!shouldShowSpeakerLabel(props.presentation)) {
    return null;
  }

  if (props.presentation.entryType === "cat_name_prompt") {
    return <Text style={styles.promptEyebrow}>Name your cat</Text>;
  }

  const speakerName = props.presentation.speakerName.trim();
  const isOcnoer = speakerName.toLowerCase() === "ocnoer";

  return (
    <Text style={isOcnoer ? styles.ocnoerSpeaker : styles.speaker}>
      {props.presentation.speakerName}
    </Text>
  );
}

function DressOptionCard(props: {
  option: NativeReaderDressOption;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={`Choose ${props.option.label}`}
      accessibilityRole="button"
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.dressPreviewButton,
        pressed ? styles.pressed : null
      ]}
    >
      {props.option.previewImageUrl ? (
        <SvgUri
          height="100%"
          preserveAspectRatio="xMidYMid meet"
          uri={props.option.previewImageUrl}
          width="100%"
        />
      ) : (
        <View style={styles.emptyDressPreview}>
          <Text style={styles.emptyDressPreviewText}>No preview</Text>
        </View>
      )}
    </Pressable>
  );
}

function ContinueArrow(props: {
  canAdvance: boolean;
  isMoving: boolean;
  onAdvance: () => void;
}) {
  return (
    <View style={styles.continueSlot}>
      <Pressable
        accessibilityLabel={props.isMoving ? "Loading next line" : "Continue"}
        accessibilityRole="button"
        disabled={!props.canAdvance || props.isMoving}
        onPress={props.onAdvance}
        style={({ pressed }) => [
          styles.continueButton,
          !props.canAdvance || props.isMoving ? styles.disabled : null,
          pressed && props.canAdvance && !props.isMoving ? styles.pressed : null
        ]}
      >
        {props.isMoving ? (
          <ActivityIndicator color={ocnoerTheme.colors.text} size="small" />
        ) : (
          <Text style={styles.continueText}>{"\u2192"}</Text>
        )}
      </Pressable>
    </View>
  );
}

export function NativeReaderDialogue(props: ReaderDialogueProps) {
  const cardPosition = getDialogueCardPositionStyle(props.presentation);
  const motionDirection = getDialogueMotionDirection(props.presentation);
  const [dressIndex, setDressIndex] = useState(0);
  const selectedDressOption = useMemo(() => {
    if (props.presentation.status !== "supported") {
      return null;
    }

    return (
      props.presentation.dressOptions[
        Math.min(dressIndex, props.presentation.dressOptions.length - 1)
      ] ?? null
    );
  }, [dressIndex, props.presentation]);

  useEffect(() => {
    setDressIndex(0);
  }, [props.presentation.dialogueEntryId]);

  if (props.presentation.status === "unsupported") {
    return (
      <DirectionalSlideView
        animationKey={`${props.presentation.status}:${props.presentation.dialogueEntryId}`}
        direction={motionDirection}
        isExiting={props.isExiting}
        pointerEvents={props.isExiting ? "none" : "auto"}
        style={[styles.dialogueCard, cardPosition]}
      >
        <OcnoerSurface style={styles.dialogueSurface} variant="glass">
          <Text style={styles.unsupportedTitle}>Unsupported Story Entry</Text>
          <Text style={styles.body}>{props.presentation.message}</Text>
          <Text style={styles.metaText}>
            Entry {props.presentation.dialogueEntryId}
          </Text>
          <ContinueArrow
            canAdvance={false}
            isMoving={props.isMoving}
            onAdvance={props.onAdvance}
          />
        </OcnoerSurface>
      </DirectionalSlideView>
    );
  }

  const supportedPresentation = props.presentation;
  const isDressPrompt = supportedPresentation.entryType === "dress_prompt";
  const shouldShowDialogueText =
    supportedPresentation.dialogueText.length > 0 &&
    !supportedPresentation.needsCatNameInput;

  return (
    <DirectionalSlideView
      animationKey={`${props.presentation.status}:${props.presentation.dialogueEntryId}`}
      direction={motionDirection}
      isExiting={props.isExiting}
      pointerEvents={props.isExiting ? "none" : "auto"}
      style={[styles.dialogueCard, cardPosition]}
    >
      <OcnoerSurface style={styles.dialogueSurface} variant="glass">
        <SpeakerLabel presentation={props.presentation} />

        {shouldShowDialogueText ? (
          <Text
            style={isDressPrompt ? styles.dressPromptText : styles.dialogueText}
          >
            {supportedPresentation.dialogueText}
          </Text>
        ) : null}

        {supportedPresentation.needsCatNameInput ? (
          <View style={styles.promptBlock}>
            <OcnoerTextInput
              autoCapitalize="words"
              editable={!props.isSavingCatName}
              onChangeText={props.onCatNameInputChange}
              onSubmitEditing={props.onSubmitCatName}
              placeholder="Enter cat name"
              returnKeyType="done"
              value={props.catNameInputValue}
            />
            {props.catNameInputError ? (
              <Text style={styles.errorText}>{props.catNameInputError}</Text>
            ) : null}
          </View>
        ) : null}

        {isDressPrompt && selectedDressOption ? (
          <View style={styles.dressPromptBlock}>
            <View style={styles.dressCarousel}>
              <Pressable
                accessibilityLabel="Previous dress option"
                accessibilityRole="button"
                disabled={supportedPresentation.dressOptions.length <= 1}
                onPress={() => {
                  setDressIndex((currentIndex) =>
                    currentIndex <= 0
                      ? supportedPresentation.dressOptions.length - 1
                      : currentIndex - 1
                  );
                }}
                style={({ pressed }) => [
                  styles.dressArrow,
                  supportedPresentation.dressOptions.length <= 1
                    ? styles.disabled
                    : null,
                  pressed ? styles.pressed : null
                ]}
              >
                <Text style={styles.dressArrowText}>{"\u2190"}</Text>
              </Pressable>

              <View style={styles.dressPreviewWrap}>
                <DressOptionCard
                  option={selectedDressOption}
                  onPress={() =>
                    props.onSelectDressOption(selectedDressOption.key)
                  }
                />
                <Text style={styles.dressCounter}>
                  {dressIndex + 1} of{" "}
                  {supportedPresentation.dressOptions.length}
                </Text>
              </View>

              <Pressable
                accessibilityLabel="Next dress option"
                accessibilityRole="button"
                disabled={supportedPresentation.dressOptions.length <= 1}
                onPress={() => {
                  setDressIndex((currentIndex) =>
                    currentIndex >=
                    supportedPresentation.dressOptions.length - 1
                      ? 0
                      : currentIndex + 1
                  );
                }}
                style={({ pressed }) => [
                  styles.dressArrow,
                  supportedPresentation.dressOptions.length <= 1
                    ? styles.disabled
                    : null,
                  pressed ? styles.pressed : null
                ]}
              >
                <Text style={styles.dressArrowText}>{"\u2192"}</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {props.actionError ? (
          <Text style={styles.errorText}>{props.actionError}</Text>
        ) : null}
        {props.persistenceError ? (
          <Text style={styles.warningText}>{props.persistenceError}</Text>
        ) : null}

        {!isDressPrompt ? (
          <ContinueArrow
            canAdvance={!props.isMoving}
            isMoving={props.isMoving || props.isSavingCatName}
            onAdvance={() => {
              if (supportedPresentation.needsCatNameInput) {
                props.onSubmitCatName();
                return;
              }

              props.onAdvance();
            }}
          />
        ) : null}
      </OcnoerSurface>
    </DirectionalSlideView>
  );
}

const styles = StyleSheet.create({
  dialogueCard: {
    bottom: ocnoerWebPlayer.dialogueCard.bottomInset,
    maxHeight: "64%",
    position: "absolute",
    zIndex: 20
  },
  dialogueSurface: {
    maxHeight: "100%"
  },
  speaker: {
    color: ocnoerTheme.colors.textSubtle,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 2,
    marginBottom: ocnoerTheme.spacing.md,
    textTransform: "uppercase"
  },
  ocnoerSpeaker: {
    color: ocnoerTheme.colors.textMuted,
    fontFamily: ocnoerTheme.typography.family.script,
    fontSize: ocnoerTheme.typography.size.scriptName,
    lineHeight: 44,
    marginBottom: ocnoerTheme.spacing.sm
  },
  promptEyebrow: {
    ...ocnoerTheme.text.eyebrow,
    color: ocnoerTheme.colors.textMuted,
    marginBottom: ocnoerTheme.spacing.md
  },
  dialogueText: {
    ...ocnoerTheme.text.dialogue,
    minHeight: 56
  },
  dressPromptText: {
    color: ocnoerTheme.colors.text,
    fontFamily: ocnoerTheme.typography.family.script,
    fontSize: ocnoerTheme.typography.size.dressPrompt,
    lineHeight: ocnoerTheme.typography.lineHeight.dressPrompt,
    textAlign: "center"
  },
  promptBlock: {
    marginTop: ocnoerTheme.spacing.lg
  },
  dressPromptBlock: {
    marginTop: ocnoerTheme.spacing.xl
  },
  dressCarousel: {
    alignItems: "center",
    flexDirection: "row",
    gap: ocnoerTheme.spacing.sm,
    justifyContent: "center"
  },
  dressArrow: {
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.25)",
    borderColor: "rgba(255, 255, 255, 0.15)",
    borderRadius: ocnoerTheme.radii.pill,
    borderWidth: 1,
    height: 40,
    justifyContent: "center",
    width: 40
  },
  dressArrowText: {
    color: ocnoerTheme.colors.text,
    fontSize: 18,
    fontWeight: "800",
    lineHeight: 22
  },
  dressPreviewWrap: {
    alignItems: "center",
    maxWidth: ocnoerWebPlayer.dialogueCard.promptPreviewMaxWidth,
    width: "58%"
  },
  dressPreviewButton: {
    alignItems: "center",
    aspectRatio: 4 / 5,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderColor: ocnoerTheme.colors.border,
    borderRadius: ocnoerTheme.radii.lg,
    borderWidth: 1,
    justifyContent: "center",
    overflow: "hidden",
    padding: ocnoerTheme.spacing.sm,
    width: "100%"
  },
  emptyDressPreview: {
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.24)",
    borderRadius: ocnoerTheme.radii.md,
    flex: 1,
    justifyContent: "center",
    width: "100%"
  },
  emptyDressPreviewText: {
    color: ocnoerTheme.colors.textSubtle,
    fontSize: 12,
    fontWeight: "700"
  },
  dressCounter: {
    color: ocnoerTheme.colors.textSubtle,
    fontSize: 12,
    lineHeight: 16,
    marginTop: ocnoerTheme.spacing.sm,
    textAlign: "center"
  },
  continueSlot: {
    alignItems: "center",
    flexDirection: "row",
    height: 36,
    justifyContent: "flex-end",
    marginTop: ocnoerTheme.spacing.xl
  },
  continueButton: {
    alignItems: "center",
    borderRadius: ocnoerTheme.radii.pill,
    height: 36,
    justifyContent: "center",
    width: 36
  },
  continueText: {
    color: ocnoerTheme.colors.text,
    fontSize: 24,
    fontWeight: "700",
    lineHeight: 28
  },
  body: {
    ...ocnoerTheme.text.body,
    marginBottom: ocnoerTheme.spacing.lg
  },
  metaText: {
    color: ocnoerTheme.colors.textSubtle,
    fontSize: 12,
    lineHeight: 18
  },
  unsupportedTitle: {
    color: ocnoerTheme.colors.rose,
    fontSize: 18,
    fontWeight: "900",
    marginBottom: ocnoerTheme.spacing.sm
  },
  errorText: {
    color: ocnoerTheme.colors.rose,
    fontSize: 14,
    lineHeight: 20,
    marginTop: ocnoerTheme.spacing.md
  },
  warningText: {
    color: ocnoerTheme.colors.warning,
    fontSize: 13,
    lineHeight: 19,
    marginTop: ocnoerTheme.spacing.md
  },
  pressed: {
    opacity: ocnoerTheme.opacity.pressed
  },
  disabled: {
    opacity: ocnoerTheme.opacity.disabled
  }
});
