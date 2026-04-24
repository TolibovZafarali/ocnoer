import { StyleSheet, Text, View } from "react-native";

import type { NativeReaderBoundaryPresentation } from "../boundaryPresentation";
import { OcnoerButton, OcnoerSurface, OcnoerPill } from "../../ui/primitives";
import { ocnoerTheme } from "../../ui/theme";
import { FadeInView } from "./NativeCinematic";

type NativeReaderBoundaryCardProps = {
  boundary: NativeReaderBoundaryPresentation;
  actionError: string | null;
  persistenceError: string | null;
  isMoving: boolean;
  canRetreat: boolean;
  onAdvance: () => void;
  onRetreat: () => void;
};

function BoundaryActions(props: {
  primaryActionLabel: string | null;
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
  const isChapterCard =
    props.boundary.type === "chapter-opening-card" ||
    props.boundary.type === "chapter-ending-card" ||
    props.boundary.type === "story-finished";

  if (isChapterCard) {
    return (
      <FadeInView
        animationKey={`${props.boundary.type}:${props.boundary.title}:${props.boundary.body}`}
        durationMs={ocnoerTheme.motion.stageFadeMs}
        style={styles.fullCardWrap}
      >
        <View style={styles.fullCard}>
          <Text style={styles.chapterCardText}>{props.boundary.body}</Text>
          {props.boundary.meta ? (
            <OcnoerPill style={styles.metaPill}>
              <Text style={styles.metaPillText}>{props.boundary.meta}</Text>
            </OcnoerPill>
          ) : null}
          {props.actionError ? (
            <Text style={styles.errorText}>{props.actionError}</Text>
          ) : null}
          {props.persistenceError ? (
            <Text style={styles.warningText}>{props.persistenceError}</Text>
          ) : null}
          <BoundaryActions
            canRetreat={props.canRetreat}
            isMoving={props.isMoving}
            primaryActionLabel={props.boundary.primaryActionLabel}
            onAdvance={props.onAdvance}
            onRetreat={props.onRetreat}
          />
        </View>
      </FadeInView>
    );
  }

  return (
    <FadeInView
      animationKey={`${props.boundary.type}:${props.boundary.title}:${props.boundary.body}`}
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
          canRetreat={props.canRetreat}
          isMoving={props.isMoving}
          primaryActionLabel={props.boundary.primaryActionLabel}
          onAdvance={props.onAdvance}
          onRetreat={props.onRetreat}
        />
      </OcnoerSurface>
    </FadeInView>
  );
}

const styles = StyleSheet.create({
  fullCardWrap: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: ocnoerTheme.colors.black,
    justifyContent: "center",
    padding: ocnoerTheme.spacing.xxl,
    zIndex: 30
  },
  fullCard: {
    alignItems: "center"
  },
  chapterCardText: {
    color: ocnoerTheme.colors.text,
    fontFamily: ocnoerTheme.typography.family.script,
    fontSize: 26,
    lineHeight: 44,
    maxWidth: 420,
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
    justifyContent: "center",
    padding: ocnoerTheme.spacing.lg,
    zIndex: 28
  },
  boundaryPanel: {
    padding: ocnoerTheme.spacing.xl
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
