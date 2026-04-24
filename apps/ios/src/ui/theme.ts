import { Platform, type TextStyle, type ViewStyle } from "react-native";

export const ocnoerColors = {
  black: "#000000",
  ink: "#02040a",
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
    dressPrompt: 34
  },
  lineHeight: {
    body: 24,
    dialogue: 29,
    title: 38,
    boundaryTitle: 36,
    dressPrompt: 40
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
  normalMs: 240,
  stageFadeMs: 320,
  blackoutCoverMs: 420
} as const;

export const ocnoerStage = {
  preferredAspectRatio: 9 / 16,
  portraitLayerHeight: "74%",
  portraitColumnWidth: "52%"
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
