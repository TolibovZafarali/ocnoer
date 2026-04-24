import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ViewStyle
} from "react-native";

import type {
  NativeReaderDressOption,
  NativeReaderPresentation
} from "../readerPresentation";
import {
  OcnoerButton,
  OcnoerSurface,
  OcnoerTextInput
} from "../../ui/primitives";
import { ocnoerTheme } from "../../ui/theme";

type ReaderDialogueProps = {
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
};

function getDialogueCardPositionStyle(
  presentation: NativeReaderPresentation
): ViewStyle {
  if (presentation.dialogueCardPlacement === "speaker-left") {
    return {
      left: "38%",
      right: ocnoerTheme.spacing.md
    };
  }

  if (presentation.dialogueCardPlacement === "speaker-right") {
    return {
      left: ocnoerTheme.spacing.md,
      right: "38%"
    };
  }

  if (presentation.dialogueCardPlacement === "cat-name") {
    return {
      left: ocnoerTheme.spacing.md,
      right: "22%"
    };
  }

  return {
    left: ocnoerTheme.spacing.md,
    right: ocnoerTheme.spacing.md
  };
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
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <View style={styles.dressOptionWrap}>
      <OcnoerButton
        accessibilityLabel={`Choose ${props.option.label}`}
        label=""
        onPress={props.onPress}
        style={[
          styles.dressPreviewButton,
          props.selected ? styles.dressOptionSelected : null
        ]}
        variant="secondary"
      />
      <View pointerEvents="none" style={styles.dressPreviewContent}>
        {props.option.previewImageUrl ? (
          <Image
            accessibilityIgnoresInvertColors
            resizeMode="contain"
            source={{ uri: props.option.previewImageUrl }}
            style={styles.dressPreview}
          />
        ) : (
          <View style={styles.emptyDressPreview}>
            <Text style={styles.emptyDressPreviewText}>No preview</Text>
          </View>
        )}
      </View>
      <Text numberOfLines={2} style={styles.dressOptionText}>
        {props.option.label}
      </Text>
    </View>
  );
}

export function ReaderActions(props: {
  canAdvance: boolean;
  canRetreat: boolean;
  isMoving: boolean;
  onAdvance: () => void;
  onRetreat: () => void;
}) {
  return (
    <View style={styles.actions}>
      <OcnoerButton
        disabled={!props.canRetreat || props.isMoving}
        label="Back"
        onPress={props.onRetreat}
        style={styles.actionButton}
        variant="ghost"
      />
      <OcnoerButton
        disabled={!props.canAdvance || props.isMoving}
        label={props.isMoving ? "Loading" : "Next"}
        loading={props.isMoving}
        onPress={props.onAdvance}
        style={styles.actionButton}
      />
    </View>
  );
}

export function NativeReaderDialogue(props: ReaderDialogueProps) {
  const cardPosition = getDialogueCardPositionStyle(props.presentation);

  if (props.presentation.status === "unsupported") {
    return (
      <OcnoerSurface
        style={[styles.dialogueCard, cardPosition]}
        variant="glass"
      >
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
      </OcnoerSurface>
    );
  }

  const canAdvance =
    !props.presentation.needsCatNameInput &&
    !props.presentation.needsDressSelection &&
    !props.isMoving;
  const selectedDressOptionKey = props.presentation.selectedDressOptionKey;
  const isDressPrompt = props.presentation.entryType === "dress_prompt";
  const shouldShowDialogueText =
    props.presentation.dialogueText.length > 0 &&
    !props.presentation.needsCatNameInput;

  return (
    <OcnoerSurface style={[styles.dialogueCard, cardPosition]} variant="glass">
      <SpeakerLabel presentation={props.presentation} />

      {shouldShowDialogueText ? (
        <Text
          style={isDressPrompt ? styles.dressPromptText : styles.dialogueText}
        >
          {props.presentation.dialogueText}
        </Text>
      ) : null}

      {props.presentation.needsCatNameInput ? (
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
          <OcnoerButton
            disabled={props.isSavingCatName}
            label={props.isSavingCatName ? "Saving" : "Save Name"}
            loading={props.isSavingCatName}
            onPress={props.onSubmitCatName}
            style={styles.promptButton}
          />
        </View>
      ) : null}

      {props.presentation.dressOptions.length > 0 ? (
        <View style={styles.promptBlock}>
          <Text style={styles.promptEyebrow}>Choose Outfit</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.dressScroll}
          >
            {props.presentation.dressOptions.map((option) => (
              <DressOptionCard
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
    </OcnoerSurface>
  );
}

const styles = StyleSheet.create({
  dialogueCard: {
    bottom: ocnoerTheme.spacing.md,
    maxHeight: "52%",
    padding: ocnoerTheme.spacing.xl,
    position: "absolute",
    zIndex: 20
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
  promptButton: {
    marginTop: ocnoerTheme.spacing.md
  },
  dressScroll: {
    marginHorizontal: -ocnoerTheme.spacing.xs
  },
  dressOptionWrap: {
    marginHorizontal: ocnoerTheme.spacing.xs,
    width: 118
  },
  dressPreviewButton: {
    borderRadius: ocnoerTheme.radii.lg,
    height: 134,
    paddingHorizontal: 0
  },
  dressOptionSelected: {
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    borderColor: ocnoerTheme.colors.borderFocus
  },
  dressPreviewContent: {
    height: 134,
    left: 0,
    padding: ocnoerTheme.spacing.sm,
    position: "absolute",
    right: 0,
    top: 0
  },
  dressPreview: {
    height: "100%",
    width: "100%"
  },
  emptyDressPreview: {
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.24)",
    borderRadius: ocnoerTheme.radii.md,
    flex: 1,
    justifyContent: "center"
  },
  emptyDressPreviewText: {
    color: ocnoerTheme.colors.textSubtle,
    fontSize: 12,
    fontWeight: "700"
  },
  dressOptionText: {
    color: ocnoerTheme.colors.text,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 16,
    marginTop: ocnoerTheme.spacing.sm,
    textAlign: "center"
  },
  actions: {
    alignItems: "center",
    flexDirection: "row",
    gap: ocnoerTheme.spacing.sm,
    justifyContent: "flex-end",
    marginTop: ocnoerTheme.spacing.xl
  },
  actionButton: {
    minHeight: 42,
    minWidth: 88,
    paddingHorizontal: ocnoerTheme.spacing.lg
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
  }
});
