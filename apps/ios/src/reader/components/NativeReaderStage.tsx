import { Image, StyleSheet, View } from "react-native";
import { SvgUri } from "react-native-svg";

import type {
  NativeReaderPortrait,
  NativeReaderPresentation
} from "../readerPresentation";
import { ocnoerTheme, ocnoerWebPlayer } from "../../ui/theme";
import {
  DirectionalSlideView,
  FadeInView,
  StageScrims
} from "./NativeCinematic";

function Portrait(props: {
  isExiting: boolean;
  portrait: NativeReaderPortrait | null;
  side: "left" | "right";
}) {
  if (!props.portrait) {
    return null;
  }

  return (
    <View
      pointerEvents="none"
      style={[
        styles.portraitSlot,
        props.side === "left"
          ? styles.portraitSlotLeft
          : styles.portraitSlotRight
      ]}
    >
      <DirectionalSlideView
        animationKey={props.portrait.key}
        direction={props.side === "left" ? "from-left" : "from-right"}
        isExiting={props.isExiting}
        pointerEvents="none"
        style={styles.portraitFade}
      >
        <View
          accessibilityLabel={props.portrait.label}
          accessible
          pointerEvents="none"
          style={[
            styles.portraitSvg,
            props.side === "left"
              ? styles.portraitImageLeft
              : styles.portraitImageRight,
            props.portrait.isActiveSpeaker
              ? styles.portraitImageActive
              : styles.portraitImageInactive
          ]}
        >
          <SvgUri
            height="100%"
            preserveAspectRatio={
              props.side === "left" ? "xMinYMax meet" : "xMaxYMax meet"
            }
            uri={props.portrait.imageUrl}
            width="100%"
          />
        </View>
      </DirectionalSlideView>
    </View>
  );
}

export function NativeReaderStage(props: {
  isLineExiting: boolean;
  presentation: NativeReaderPresentation;
}) {
  return (
    <View style={styles.stage}>
      {props.presentation.backgroundImageUrl ? (
        <FadeInView
          animationKey={props.presentation.backgroundImageUrl}
          durationMs={ocnoerTheme.motion.stageFadeMs}
          style={styles.stageBackgroundFade}
        >
          <Image
            accessibilityIgnoresInvertColors
            resizeMode="cover"
            source={{ uri: props.presentation.backgroundImageUrl }}
            style={styles.stageBackground}
          />
        </FadeInView>
      ) : (
        <View style={styles.emptyBackground} />
      )}
      <StageScrims />
      <View pointerEvents="none" style={styles.portraitLayer}>
        <Portrait
          isExiting={props.isLineExiting}
          portrait={props.presentation.leftPortrait}
          side="left"
        />
        <Portrait
          isExiting={props.isLineExiting}
          portrait={props.presentation.rightPortrait}
          side="right"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: ocnoerWebPlayer.stage.backgroundColor,
    overflow: "hidden"
  },
  stageBackground: {
    ...StyleSheet.absoluteFillObject
  },
  stageBackgroundFade: {
    ...StyleSheet.absoluteFillObject
  },
  emptyBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: ocnoerTheme.colors.black
  },
  portraitLayer: {
    bottom: 0,
    height: ocnoerTheme.stage.portraitLayerHeight,
    left: 0,
    position: "absolute",
    right: 0,
    zIndex: 8
  },
  portraitSlot: {
    bottom: 0,
    height: "100%",
    overflow: "hidden",
    position: "absolute",
    width: ocnoerTheme.stage.portraitColumnWidth
  },
  portraitSlotLeft: {
    left: 0
  },
  portraitSlotRight: {
    right: 0
  },
  portraitFade: {
    height: "100%",
    width: "100%"
  },
  portraitSvg: {
    bottom: 0,
    height: "100%",
    maxWidth: ocnoerTheme.stage.portraitColumnMaxWidth,
    position: "absolute",
    width: "100%"
  },
  portraitImageLeft: {
    left: 0
  },
  portraitImageRight: {
    right: 0
  },
  portraitImageActive: {
    opacity: 1
  },
  portraitImageInactive: {
    opacity: 1
  }
});
