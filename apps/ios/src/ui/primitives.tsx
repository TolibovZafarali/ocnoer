import type { ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle
} from "react-native";

import { LoadingSpinner } from "./LoadingSpinner";
import { ocnoerTheme, ocnoerWebPlayer } from "./theme";

type OcnoerButtonVariant = "primary" | "secondary" | "ghost" | "danger";

type OcnoerButtonProps = {
  label: string;
  accessibilityLabel?: string;
  disabled?: boolean;
  loading?: boolean;
  variant?: OcnoerButtonVariant;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

type OcnoerSurfaceProps = {
  children: ReactNode;
  variant?: "glass" | "solid" | "quiet";
  style?: StyleProp<ViewStyle>;
};

type OcnoerIconButtonProps = {
  accessibilityLabel: string;
  disabled?: boolean;
  label: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

export function OcnoerScreenBackground(props: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.screen, props.style]}>
      <View pointerEvents="none" style={[styles.glow, styles.glowOne]} />
      <View pointerEvents="none" style={[styles.glow, styles.glowTwo]} />
      <View pointerEvents="none" style={[styles.glow, styles.glowThree]} />
      <View pointerEvents="none" style={styles.grid}>
        {Array.from({ length: 7 }).map((_, index) => (
          <View
            key={`grid-v-${index}`}
            style={[
              styles.gridLineVertical,
              {
                left: `${index * 16.66}%`
              }
            ]}
          />
        ))}
        {Array.from({ length: 9 }).map((_, index) => (
          <View
            key={`grid-h-${index}`}
            style={[
              styles.gridLineHorizontal,
              {
                top: `${index * 12.5}%`
              }
            ]}
          />
        ))}
      </View>
      {props.children}
    </View>
  );
}

export function OcnoerSurface(props: OcnoerSurfaceProps) {
  const variantStyle =
    props.variant === "solid"
      ? styles.surfaceSolid
      : props.variant === "quiet"
        ? styles.surfaceQuiet
        : styles.surfaceGlass;

  return (
    <View style={[styles.surfaceBase, variantStyle, props.style]}>
      {props.children}
    </View>
  );
}

export function OcnoerButton(props: OcnoerButtonProps) {
  const variant = props.variant ?? "primary";
  const buttonStyle =
    variant === "secondary"
      ? styles.buttonSecondary
      : variant === "ghost"
        ? styles.buttonGhost
        : variant === "danger"
          ? styles.buttonDanger
          : styles.buttonPrimary;
  const textStyle =
    variant === "primary"
      ? styles.buttonPrimaryText
      : variant === "danger"
        ? styles.buttonDangerText
        : styles.buttonSecondaryText;

  return (
    <Pressable
      accessibilityLabel={props.accessibilityLabel ?? props.label}
      accessibilityRole="button"
      disabled={props.disabled || props.loading}
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.buttonBase,
        buttonStyle,
        props.disabled || props.loading ? styles.disabled : null,
        pressed && !props.disabled && !props.loading ? styles.pressed : null,
        props.style
      ]}
    >
      {props.loading ? (
        <LoadingSpinner
          accessibilityLabel={`${props.label} loading`}
          size={24}
          tintColor={
            variant === "primary"
              ? ocnoerTheme.colors.stageDeep
              : ocnoerTheme.colors.text
          }
        />
      ) : (
        <Text style={[textStyle, props.textStyle]}>{props.label}</Text>
      )}
    </Pressable>
  );
}

export function OcnoerIconButton(props: OcnoerIconButtonProps) {
  return (
    <Pressable
      accessibilityLabel={props.accessibilityLabel}
      accessibilityRole="button"
      disabled={props.disabled}
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.iconButton,
        props.disabled ? styles.disabled : null,
        pressed && !props.disabled ? styles.pressed : null,
        props.style
      ]}
    >
      <Text style={[styles.iconButtonText, props.textStyle]}>
        {props.label}
      </Text>
    </Pressable>
  );
}

export function OcnoerTextInput(props: TextInputProps) {
  return (
    <TextInput
      {...props}
      placeholderTextColor={
        props.placeholderTextColor ?? ocnoerTheme.colors.textFaint
      }
      selectionColor={ocnoerTheme.colors.text}
      style={[styles.input, props.style]}
    />
  );
}

export function OcnoerInfoRow(props: {
  label: string;
  value: string;
  valueStyle?: StyleProp<TextStyle>;
}) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{props.label}</Text>
      <Text style={[styles.infoValue, props.valueStyle]}>{props.value}</Text>
    </View>
  );
}

export function OcnoerPill(props: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.pill, props.style]}>{props.children}</View>;
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: "#05080e",
    flex: 1,
    overflow: "hidden"
  },
  glow: {
    borderRadius: 999,
    opacity: 0.52,
    position: "absolute"
  },
  glowOne: {
    backgroundColor: "rgba(34, 211, 238, 0.18)",
    height: 360,
    left: -170,
    top: -140,
    width: 360
  },
  glowTwo: {
    backgroundColor: "rgba(59, 130, 246, 0.16)",
    height: 320,
    right: -170,
    top: 120,
    width: 320
  },
  glowThree: {
    backgroundColor: "rgba(99, 102, 241, 0.13)",
    bottom: -180,
    height: 360,
    left: "22%",
    width: 380
  },
  grid: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.08
  },
  gridLineVertical: {
    backgroundColor: "rgba(255, 255, 255, 0.55)",
    bottom: 0,
    position: "absolute",
    top: 0,
    width: StyleSheet.hairlineWidth
  },
  gridLineHorizontal: {
    backgroundColor: "rgba(255, 255, 255, 0.55)",
    height: StyleSheet.hairlineWidth,
    left: 0,
    position: "absolute",
    right: 0
  },
  surfaceBase: {
    borderRadius: ocnoerWebPlayer.dialogueCard.borderRadius,
    borderWidth: 1,
    padding: ocnoerWebPlayer.dialogueCard.padding
  },
  surfaceGlass: {
    ...ocnoerTheme.shadows.card,
    backgroundColor: ocnoerWebPlayer.dialogueCard.backgroundColor,
    borderColor: ocnoerWebPlayer.dialogueCard.borderColor
  },
  surfaceSolid: {
    ...ocnoerTheme.shadows.card,
    backgroundColor: ocnoerTheme.colors.panelStrong,
    borderColor: ocnoerWebPlayer.dialogueCard.borderColor
  },
  surfaceQuiet: {
    backgroundColor: ocnoerTheme.colors.panelSoft,
    borderColor: ocnoerWebPlayer.dialogueCard.borderColor
  },
  buttonBase: {
    alignItems: "center",
    borderRadius: ocnoerTheme.radii.pill,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: ocnoerTheme.spacing.xl
  },
  buttonPrimary: {
    ...ocnoerTheme.shadows.glow,
    backgroundColor: ocnoerTheme.colors.text,
    borderColor: ocnoerTheme.colors.text,
    borderWidth: 1
  },
  buttonSecondary: {
    backgroundColor: "rgba(0, 0, 0, 0.24)",
    borderColor: ocnoerTheme.colors.borderStrong,
    borderWidth: 1
  },
  buttonGhost: {
    backgroundColor: "transparent",
    borderColor: "transparent",
    borderWidth: 1
  },
  buttonDanger: {
    backgroundColor: "rgba(244, 63, 94, 0.12)",
    borderColor: "rgba(253, 164, 175, 0.32)",
    borderWidth: 1
  },
  buttonPrimaryText: {
    color: ocnoerTheme.colors.stageDeep,
    fontSize: 15,
    fontWeight: "900"
  },
  buttonSecondaryText: {
    color: ocnoerTheme.colors.text,
    fontSize: 15,
    fontWeight: "800"
  },
  buttonDangerText: {
    color: ocnoerTheme.colors.rose,
    fontSize: 15,
    fontWeight: "800"
  },
  iconButton: {
    alignItems: "center",
    borderRadius: ocnoerTheme.radii.pill,
    height: ocnoerWebPlayer.chrome.iconSize,
    justifyContent: "center",
    width: ocnoerWebPlayer.chrome.iconSize
  },
  iconButtonText: {
    color: ocnoerTheme.colors.text,
    fontSize: 25,
    fontWeight: "700",
    lineHeight: 28
  },
  disabled: {
    opacity: ocnoerTheme.opacity.disabled
  },
  pressed: {
    opacity: ocnoerTheme.opacity.pressed,
    transform: [
      {
        scale: 0.985
      }
    ]
  },
  input: {
    backgroundColor: ocnoerTheme.colors.input,
    borderColor: ocnoerTheme.colors.borderStrong,
    borderRadius: ocnoerTheme.radii.md,
    borderWidth: 1,
    color: ocnoerTheme.colors.text,
    fontSize: 17,
    minHeight: 50,
    paddingHorizontal: ocnoerTheme.spacing.lg
  },
  infoRow: {
    borderBottomColor: ocnoerTheme.colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: ocnoerTheme.spacing.md
  },
  infoLabel: {
    ...ocnoerTheme.text.label,
    marginBottom: ocnoerTheme.spacing.xs
  },
  infoValue: {
    color: ocnoerTheme.colors.text,
    fontSize: 16,
    lineHeight: 23
  },
  pill: {
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.25)",
    borderColor: ocnoerTheme.colors.borderStrong,
    borderRadius: ocnoerTheme.radii.pill,
    borderWidth: 1,
    justifyContent: "center",
    paddingHorizontal: ocnoerTheme.spacing.md,
    paddingVertical: ocnoerTheme.spacing.xs
  }
});
