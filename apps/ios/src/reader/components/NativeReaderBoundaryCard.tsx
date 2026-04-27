import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View
} from "react-native";

import type { NativeReaderBoundaryPresentation } from "../boundaryPresentation";
import {
  NATIVE_READER_CHAPTER_CARD_TEXT_APPEAR_DELAY_MS,
  createNativeReaderChapterCardRevealPlan,
  getNativeReaderChapterCardVisibleTextLengthAtElapsedMs,
  getNativeReaderTextUpdateCadenceMs
} from "../nativeReaderDialogueMotion";
import { OcnoerButton, OcnoerSurface, OcnoerPill } from "../../ui/primitives";
import { ocnoerTheme, ocnoerWebPlayer } from "../../ui/theme";
import { FadeInView } from "./NativeCinematic";

type NativeReaderBoundaryCardProps = {
  boundary: NativeReaderBoundaryPresentation;
  actionError: string | null;
  persistenceError: string | null;
  isMoving: boolean;
  isRestarting?: boolean;
  onAdvance: () => void;
  onChapterCardTextRevealComplete?: (revealKey: string) => void;
  onRevealChrome?: () => void;
  onRestart?: () => void;
  showRestartAction?: boolean;
};

type ChapterCardRevealPhase = "waiting" | "typing" | "complete";

type ChapterCardRevealState = {
  key: string;
  phase: ChapterCardRevealPhase;
  startedAt: number;
  visibleTextLength: number;
};

function createChapterCardRevealKey(
  boundary: NativeReaderBoundaryPresentation
) {
  return `${boundary.type}:${boundary.title}:${boundary.body}`;
}

function ChapterCardText(props: {
  characters: string[];
  visibleTextLength: number;
}) {
  const visibleText = props.characters
    .slice(0, props.visibleTextLength)
    .join("");
  const hiddenText = props.characters.slice(props.visibleTextLength).join("");

  return (
    <Text style={styles.chapterCardText}>
      {visibleText}
      {hiddenText.length > 0 ? (
        <Text style={styles.hiddenText}>{hiddenText}</Text>
      ) : null}
    </Text>
  );
}

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

function RestartEndingAction(props: {
  isRestarting?: boolean;
  onRestart?: () => void;
  visible: boolean;
}) {
  const progress = useRef(new Animated.Value(props.visible ? 1 : 0)).current;

  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: props.visible ? 1 : 0,
      duration: ocnoerTheme.motion.continueEnterMs,
      easing: props.visible
        ? Easing.out(Easing.cubic)
        : Easing.in(Easing.cubic),
      useNativeDriver: true
    });

    animation.start();

    return () => {
      animation.stop();
    };
  }, [progress, props.visible]);

  return (
    <Animated.View
      pointerEvents={props.visible ? "auto" : "none"}
      style={[
        styles.restartActionWrap,
        {
          opacity: progress
        }
      ]}
    >
      <Pressable
        accessibilityLabel={
          props.isRestarting ? "Restarting story" : "Restart story"
        }
        accessibilityRole="button"
        disabled={!props.visible || props.isRestarting || !props.onRestart}
        onPress={props.onRestart}
        style={({ pressed }) => [
          styles.restartActionButton,
          props.isRestarting ? styles.disabledAction : null,
          pressed && props.visible && !props.isRestarting
            ? styles.restartActionPressed
            : null
        ]}
      >
        <Text style={styles.restartActionIcon}>{"\u21bb"}</Text>
      </Pressable>
    </Animated.View>
  );
}

export function NativeReaderBoundaryCard(props: NativeReaderBoundaryCardProps) {
  const isChapterCard =
    props.boundary.type === "chapter-opening-card" ||
    props.boundary.type === "chapter-ending-card";
  const isTerminalChapterCard =
    props.boundary.type === "chapter-ending-card" &&
    !props.boundary.primaryActionLabel;
  const animationKey = `${props.boundary.type}:${props.boundary.title}:${props.boundary.body}`;
  const chapterCardRevealKey = createChapterCardRevealKey(props.boundary);
  const chapterCardRevealPlan = useMemo(
    () =>
      createNativeReaderChapterCardRevealPlan({
        text: props.boundary.body,
        enablePauseMarker: props.boundary.type === "chapter-ending-card"
      }),
    [props.boundary.body, props.boundary.type]
  );
  const [chapterCardRevealState, setChapterCardRevealState] =
    useState<ChapterCardRevealState>({
      key: chapterCardRevealKey,
      phase:
        chapterCardRevealPlan.totalVisibleCharacterCount === 0
          ? "complete"
          : "waiting",
      startedAt: Date.now(),
      visibleTextLength: 0
    });
  const completedRevealKeyRef = useRef<string | null>(null);
  const chapterCardVisibleTextLength =
    chapterCardRevealState.key === chapterCardRevealKey
      ? chapterCardRevealState.visibleTextLength
      : 0;
  const isChapterCardTextRevealComplete =
    chapterCardVisibleTextLength >=
    chapterCardRevealPlan.totalVisibleCharacterCount;
  const completeChapterCardReveal = useCallback(() => {
    setChapterCardRevealState((currentState) => {
      if (currentState.key !== chapterCardRevealKey) {
        return currentState;
      }

      return {
        key: chapterCardRevealKey,
        phase: "complete",
        startedAt: currentState.startedAt,
        visibleTextLength: chapterCardRevealPlan.totalVisibleCharacterCount
      };
    });
  }, [chapterCardRevealKey, chapterCardRevealPlan.totalVisibleCharacterCount]);
  const handleChapterCardPress = useCallback(() => {
    if (isTerminalChapterCard) {
      props.onRevealChrome?.();
      return;
    }

    if (!isChapterCardTextRevealComplete) {
      if (chapterCardRevealState.phase === "typing") {
        completeChapterCardReveal();
      }

      return;
    }

    props.onAdvance();
  }, [
    chapterCardRevealState.phase,
    completeChapterCardReveal,
    isTerminalChapterCard,
    isChapterCardTextRevealComplete,
    props.onRevealChrome,
    props.onAdvance
  ]);

  useEffect(() => {
    completedRevealKeyRef.current = null;
    setChapterCardRevealState({
      key: chapterCardRevealKey,
      phase:
        chapterCardRevealPlan.totalVisibleCharacterCount === 0
          ? "complete"
          : "waiting",
      startedAt: Date.now(),
      visibleTextLength: 0
    });
  }, [chapterCardRevealKey, chapterCardRevealPlan.totalVisibleCharacterCount]);

  useEffect(() => {
    if (
      !isChapterCard ||
      chapterCardRevealState.key !== chapterCardRevealKey ||
      chapterCardRevealState.phase !== "waiting"
    ) {
      return;
    }

    const delayMs =
      props.boundary.type === "chapter-ending-card"
        ? NATIVE_READER_CHAPTER_CARD_TEXT_APPEAR_DELAY_MS
        : 0;
    const timeoutId = setTimeout(() => {
      setChapterCardRevealState((currentState) => {
        if (currentState.key !== chapterCardRevealKey) {
          return currentState;
        }

        return {
          key: chapterCardRevealKey,
          phase: "typing",
          startedAt: Date.now(),
          visibleTextLength: 0
        };
      });
    }, delayMs);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [
    chapterCardRevealKey,
    chapterCardRevealState.key,
    chapterCardRevealState.phase,
    isChapterCard,
    props.boundary.type
  ]);

  useEffect(() => {
    if (
      !isChapterCard ||
      chapterCardRevealState.key !== chapterCardRevealKey ||
      chapterCardRevealState.phase !== "typing" ||
      isChapterCardTextRevealComplete
    ) {
      return;
    }

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const cadenceMs = getNativeReaderTextUpdateCadenceMs();

    const tick = () => {
      if (cancelled) {
        return;
      }

      const nextVisibleTextLength =
        getNativeReaderChapterCardVisibleTextLengthAtElapsedMs({
          elapsedMs: Date.now() - chapterCardRevealState.startedAt,
          plan: chapterCardRevealPlan
        });

      setChapterCardRevealState((currentState) => {
        if (currentState.key !== chapterCardRevealKey) {
          return currentState;
        }

        const boundedVisibleTextLength = Math.min(
          nextVisibleTextLength,
          chapterCardRevealPlan.totalVisibleCharacterCount
        );

        if (currentState.visibleTextLength === boundedVisibleTextLength) {
          return currentState;
        }

        return {
          key: chapterCardRevealKey,
          phase:
            boundedVisibleTextLength >=
            chapterCardRevealPlan.totalVisibleCharacterCount
              ? "complete"
              : "typing",
          startedAt: currentState.startedAt,
          visibleTextLength: boundedVisibleTextLength
        };
      });

      if (
        nextVisibleTextLength >=
        chapterCardRevealPlan.totalVisibleCharacterCount
      ) {
        return;
      }

      timeoutId = setTimeout(tick, cadenceMs);
    };

    timeoutId = setTimeout(tick, cadenceMs);

    return () => {
      cancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [
    chapterCardRevealKey,
    chapterCardRevealPlan,
    chapterCardRevealState.key,
    chapterCardRevealState.phase,
    chapterCardRevealState.startedAt,
    isChapterCard,
    isChapterCardTextRevealComplete
  ]);

  useEffect(() => {
    if (!isChapterCard || !isChapterCardTextRevealComplete) {
      return;
    }

    if (completedRevealKeyRef.current === chapterCardRevealKey) {
      return;
    }

    completedRevealKeyRef.current = chapterCardRevealKey;
    props.onChapterCardTextRevealComplete?.(chapterCardRevealKey);
  }, [
    chapterCardRevealKey,
    isChapterCard,
    isChapterCardTextRevealComplete,
    props.onChapterCardTextRevealComplete
  ]);

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

  if (isChapterCard) {
    return (
      <FadeInView
        key={animationKey}
        animationKey={animationKey}
        durationMs={
          props.boundary.type === "chapter-opening-card"
            ? ocnoerTheme.motion.openingFadeMs
            : ocnoerTheme.motion.stageFadeMs
        }
        style={styles.fullCardWrap}
      >
        <Pressable
          accessibilityLabel={props.boundary.eyebrow}
          accessibilityRole="button"
          disabled={props.isMoving}
          onPress={handleChapterCardPress}
          style={styles.fullCard}
        >
          <ChapterCardText
            characters={chapterCardRevealPlan.displayCharacters}
            visibleTextLength={chapterCardVisibleTextLength}
          />
          {props.actionError ? (
            <Text style={styles.errorText}>{props.actionError}</Text>
          ) : null}
          {props.persistenceError ? (
            <Text style={styles.warningText}>{props.persistenceError}</Text>
          ) : null}
          <RestartEndingAction
            isRestarting={props.isRestarting}
            visible={Boolean(props.showRestartAction)}
            onRestart={props.onRestart}
          />
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
  hiddenText: {
    color: "transparent"
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
  },
  restartActionWrap: {
    alignItems: "center",
    bottom: ocnoerTheme.spacing.xxxl,
    left: 0,
    position: "absolute",
    right: 0
  },
  restartActionButton: {
    alignItems: "center",
    backgroundColor: "transparent",
    height: 54,
    justifyContent: "center",
    width: 54
  },
  restartActionPressed: {
    opacity: 0.72
  },
  disabledAction: {
    opacity: 0.5
  },
  restartActionIcon: {
    color: ocnoerTheme.colors.text,
    fontSize: 34,
    fontWeight: "800",
    lineHeight: 38
  }
});
