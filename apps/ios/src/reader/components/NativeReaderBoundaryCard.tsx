import { Pressable, StyleSheet, Text, View } from "react-native";

import type { NativeReaderBoundaryPresentation } from "../boundaryPresentation";
import { OcnoerButton, OcnoerSurface, OcnoerPill } from "../../ui/primitives";
import { ocnoerTheme, ocnoerWebPlayer } from "../../ui/theme";
import { FadeInView } from "./NativeCinematic";

type NativeReaderBoundaryCardProps = {
  boundary: NativeReaderBoundaryPresentation;
  actionError: string | null;
  persistenceError: string | null;
  isMoving: boolean;
  onAdvance: () => void;
  onRevealChrome?: () => void;
};

function BoundaryActions(props: {
  primaryActionLabel: string | null;
  isMoving: boolean;
  onAdvance: () => void;
}) {
  return (
    <View style={styles.actions}>
      {props.primaryActionLabel ? (
        <OcnoerButton
          disabled={props.isMoving}
          label={props.isMoving ? "Loading" : props.primaryActionLabel}
          loading={props.isMoving}
          onPress={props.onAdvance}
          style={styles.actionButton}
        />
      ) : null}
    </View>
  );
}

export function NativeReaderBoundaryCard(props: NativeReaderBoundaryCardProps) {
  if (props.boundary.type === "scene-transition") {
    return (
      <Pressable
        accessibilityLabel="Continue scene transition"
        accessibilityRole="button"
        disabled={props.isMoving}
        onPress={props.onAdvance}
        style={styles.transitionCard}
      />
    );
  }

  if (props.boundary.type === "story-finished") {
    return (
      <Pressable
        accessibilityLabel="Story finished"
        accessibilityRole="button"
        onPress={props.onRevealChrome}
        style={styles.storyFinishedCard}
      />
    );
  }

  const isChapterCard =
    props.boundary.type === "chapter-opening-card" ||
    props.boundary.type === "chapter-ending-card";
  const animationKey = `${props.boundary.type}:${props.boundary.title}:${props.boundary.body}`;

  if (isChapterCard) {
    return (
      <FadeInView
        key={animationKey}
        animationKey={animationKey}
        durationMs={ocnoerTheme.motion.stageFadeMs}
        style={styles.fullCardWrap}
      >
        <Pressable
          accessibilityLabel={props.boundary.eyebrow}
          accessibilityRole="button"
          disabled={props.isMoving || !props.boundary.primaryActionLabel}
          onPress={props.onAdvance}
          style={styles.fullCard}
        >
          <Text style={styles.chapterCardText}>{props.boundary.body}</Text>
          {props.actionError ? (
            <Text style={styles.errorText}>{props.actionError}</Text>
          ) : null}
          {props.persistenceError ? (
            <Text style={styles.warningText}>{props.persistenceError}</Text>
          ) : null}
        </Pressable>
      </FadeInView>
    );
  }

  return (
    <FadeInView
      key={animationKey}
      animationKey={animationKey}
      durationMs={ocnoerTheme.motion.normalMs}
      style={styles.boundaryWrap}
    >
      <OcnoerSurface style={styles.boundaryPanel} variant="glass">
        <View style={styles.boundaryHeader}>
          <View>
            <Text style={styles.eyebrow}>{props.boundary.eyebrow}</Text>
            <Text style={styles.boundaryTitle}>{props.boundary.title}</Text>
          </View>
          {props.boundary.meta ? (
            <OcnoerPill>
              <Text style={styles.metaPillText}>{props.boundary.meta}</Text>
            </OcnoerPill>
          ) : null}
        </View>
        <Text style={styles.boundaryBody}>{props.boundary.body}</Text>

        {props.actionError ? (
          <Text style={styles.errorText}>{props.actionError}</Text>
        ) : null}
        {props.persistenceError ? (
          <Text style={styles.warningText}>{props.persistenceError}</Text>
        ) : null}

        <BoundaryActions
          isMoving={props.isMoving}
          primaryActionLabel={props.boundary.primaryActionLabel}
          onAdvance={props.onAdvance}
        />
      </OcnoerSurface>
    </FadeInView>
  );
}

const styles = StyleSheet.create({
  fullCardWrap: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: ocnoerTheme.colors.black,
    zIndex: 30
  },
  fullCard: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    padding: ocnoerTheme.spacing.xxl
  },
  chapterCardText: {
    color: ocnoerTheme.colors.text,
    fontFamily: ocnoerTheme.typography.family.chapterCard,
    fontSize: ocnoerTheme.typography.size.chapterCard,
    letterSpacing: 0.2,
    lineHeight: ocnoerTheme.typography.lineHeight.chapterCard,
    maxWidth: ocnoerTheme.stage.chapterCardMaxWidth,
    textAlign: "center"
  },
  metaPill: {
    marginTop: ocnoerTheme.spacing.xxl
  },
  metaPillText: {
    color: ocnoerTheme.colors.textMuted,
    fontSize: 12,
    fontWeight: "800"
  },
  boundaryWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-start",
    padding: ocnoerTheme.spacing.md,
    paddingTop: ocnoerTheme.spacing.md,
    zIndex: 28
  },
  boundaryPanel: {
    backgroundColor: ocnoerWebPlayer.boundaryCard.backgroundColor,
    borderColor: ocnoerWebPlayer.boundaryCard.borderColor,
    borderRadius: ocnoerWebPlayer.boundaryCard.borderRadius,
    padding: ocnoerWebPlayer.boundaryCard.padding
  },
  boundaryHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: ocnoerTheme.spacing.md,
    justifyContent: "space-between",
    marginBottom: ocnoerTheme.spacing.lg
  },
  eyebrow: {
    ...ocnoerTheme.text.eyebrow,
    color: ocnoerTheme.colors.textSubtle,
    marginBottom: ocnoerTheme.spacing.sm
  },
  boundaryTitle: {
    color: ocnoerTheme.colors.text,
    fontSize: ocnoerTheme.typography.size.boundaryTitle,
    fontWeight: "800",
    lineHeight: ocnoerTheme.typography.lineHeight.boundaryTitle
  },
  boundaryBody: {
    ...ocnoerTheme.text.body,
    color: ocnoerTheme.colors.textMuted
  },
  actions: {
    alignItems: "center",
    flexDirection: "row",
    gap: ocnoerTheme.spacing.sm,
    justifyContent: "center",
    marginTop: ocnoerTheme.spacing.xxl
  },
  actionButton: {
    minWidth: 104
  },
  transitionCard: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: ocnoerTheme.colors.black,
    zIndex: 30
  },
  storyFinishedCard: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: ocnoerTheme.colors.black,
    zIndex: 30
  },
  errorText: {
    color: ocnoerTheme.colors.rose,
    fontSize: 14,
    lineHeight: 20,
    marginTop: ocnoerTheme.spacing.md,
    textAlign: "center"
  },
  warningText: {
    color: ocnoerTheme.colors.warning,
    fontSize: 13,
    lineHeight: 19,
    marginTop: ocnoerTheme.spacing.md,
    textAlign: "center"
  }
});
