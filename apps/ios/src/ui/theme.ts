import { Platform, type TextStyle, type ViewStyle } from "react-native";

export const ocnoerColors = {
  black: "#000000",
  ink: "#02040a",
  slate950: "#020617",
  night: "#05070f",
  stage: "#071014",
  stageDeep: "#020617",
  panel: "rgba(15, 23, 42, 0.82)",
  panelStrong: "rgba(2, 6, 23, 0.88)",
  panelSoft: "rgba(15, 23, 42, 0.58)",
  input: "rgba(0, 0, 0, 0.32)",
  border: "rgba(255, 255, 255, 0.10)",
  borderStrong: "rgba(255, 255, 255, 0.18)",
  borderFocus: "rgba(255, 255, 255, 0.34)",
  text: "#f8fafc",
  textMuted: "#cbd5e1",
  textSubtle: "#94a3b8",
  textFaint: "#64748b",
  gold: "#facc15",
  cyan: "#67e8f9",
  rose: "#fda4af",
  warning: "#fde68a",
  success: "#bbf7d0"
} as const;

export const ocnoerSpacing = {
  xxs: 4,
  xs: 6,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32
} as const;

export const ocnoerRadii = {
  sm: 8,
  md: 12,
  lg: 18,
  xl: 24,
  card: 28,
  pill: 999
} as const;

export const ocnoerOpacity = {
  disabled: 0.48,
  pressed: 0.76,
  inactivePortrait: 0.72,
  scrim: 0.36,
  heavyScrim: 0.84
} as const;

const iosSerif = "Georgia";
const iosScript = "Snell Roundhand";
const iosHandwriting = "Noteworthy";

export const ocnoerTypography = {
  family: {
    body: Platform.select({
      ios: "System",
      default: undefined
    }),
    dialogue: Platform.select({
      ios: iosSerif,
      default: "serif"
    }),
    script: Platform.select({
      ios: iosScript,
      default: "serif"
    }),
    chapterCard: Platform.select({
      ios: iosHandwriting,
      default: "serif"
    }),
    monospace: Platform.select({
      ios: "Menlo",
      default: "monospace"
    })
  },
  size: {
    eyebrow: 11,
    label: 12,
    meta: 13,
    body: 16,
    dialogue: 18,
    title: 32,
    boundaryTitle: 30,
    scriptName: 42,
    dressPrompt: 34,
    chapterCard: 18
  },
  lineHeight: {
    body: 24,
    dialogue: 29,
    title: 38,
    boundaryTitle: 36,
    dressPrompt: 40,
    chapterCard: 37
  }
} as const;

export const ocnoerShadows = {
  card: Platform.select<ViewStyle>({
    ios: {
      shadowColor: "#000000",
      shadowOffset: {
        width: 0,
        height: 24
      },
      shadowOpacity: 0.36,
      shadowRadius: 34
    },
    default: {
      elevation: 12
    }
  }) as ViewStyle,
  glow: Platform.select<ViewStyle>({
    ios: {
      shadowColor: "#ffffff",
      shadowOffset: {
        width: 0,
        height: 16
      },
      shadowOpacity: 0.16,
      shadowRadius: 22
    },
    default: {
      elevation: 6
    }
  }) as ViewStyle
} as const satisfies Record<string, ViewStyle>;

export const ocnoerMotion = {
  quickMs: 160,
  continueEnterMs: 180,
  lineExitMs: 240,
  normalMs: 300,
  stageFadeMs: 320,
  mapOverlayMs: 340,
  blackoutCoverMs: 900,
  openingFadeMs: 1200
} as const;

export const ocnoerStage = {
  preferredAspectRatio: 9 / 16,
  portraitLayerHeight: "72%",
  portraitLayerHeightLarge: "78%",
  portraitColumnWidth: "52%",
  portraitColumnMaxWidth: 352,
  dialogueInset: 12,
  dialogueInsetLarge: 20,
  dialogueCardRadius: 28,
  dialogueCardPadding: 20,
  chapterCardMaxWidth: 448,
  chapterCardWidthRatio: "72%"
} as const;

export const ocnoerWebPlayer = {
  gate: {
    collapsedPillSize: 72,
    expandedPillMaxWidth: 416,
    pillBackground: "rgba(0, 0, 0, 0.35)",
    pillBorder: "rgba(255, 255, 255, 0.10)",
    arrowBackground: "#ffffff",
    arrowColor: "#020617",
    arrowShadowColor: "rgba(255, 255, 255, 0.85)"
  },
  dialogueCard: {
    backgroundColor: "rgba(2, 6, 23, 0.82)",
    borderColor: "rgba(255, 255, 255, 0.10)",
    borderRadius: 28,
    padding: 20,
    bottomInset: 12,
    sideInset: 12,
    promptPreviewMaxWidth: 216
  },
  boundaryCard: {
    backgroundColor: "rgba(2, 6, 23, 0.82)",
    borderColor: "rgba(255, 255, 255, 0.10)",
    borderRadius: 28,
    padding: 20
  },
  stage: {
    backgroundColor: "#020617",
    overlayBase: "rgba(2, 6, 17, 0.28)",
    overlayBottom: "rgba(0, 0, 0, 0.62)",
    transitionBlackout: "#000000"
  },
  chrome: {
    iconSize: 44,
    inset: 12,
    iconColor: "#f8fafc",
    iconMutedColor: "#cbd5e1",
    panelBackground: "rgba(0, 0, 0, 0.35)",
    panelBorder: "rgba(255, 255, 255, 0.10)"
  }
} as const;

export const ocnoerText = {
  eyebrow: {
    color: ocnoerColors.textSubtle,
    fontSize: ocnoerTypography.size.eyebrow,
    fontWeight: "800",
    letterSpacing: 1.8,
    textTransform: "uppercase"
  } satisfies TextStyle,
  label: {
    color: ocnoerColors.textSubtle,
    fontSize: ocnoerTypography.size.label,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase"
  } satisfies TextStyle,
  body: {
    color: ocnoerColors.textMuted,
    fontSize: ocnoerTypography.size.body,
    lineHeight: ocnoerTypography.lineHeight.body
  } satisfies TextStyle,
  dialogue: {
    color: ocnoerColors.text,
    fontFamily: ocnoerTypography.family.dialogue,
    fontSize: ocnoerTypography.size.dialogue,
    lineHeight: ocnoerTypography.lineHeight.dialogue
  } satisfies TextStyle
} as const;

export const ocnoerTheme = {
  colors: ocnoerColors,
  spacing: ocnoerSpacing,
  radii: ocnoerRadii,
  opacity: ocnoerOpacity,
  typography: ocnoerTypography,
  shadows: ocnoerShadows,
  motion: ocnoerMotion,
  stage: ocnoerStage,
  text: ocnoerText
} as const;
