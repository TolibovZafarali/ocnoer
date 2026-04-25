import { Image as ExpoImage } from "expo-image";
import {
  StyleSheet,
  View,
  type ImageStyle,
  type StyleProp
} from "react-native";
import { SvgAst } from "react-native-svg";

import type {
  NativeReaderPortrait,
  NativeReaderPresentation
} from "../readerPresentation";
import {
  createCachedReaderImageSource,
  getAssetRenderKind,
  usePreloadedReaderImageRef,
  usePreloadedReaderSvgAst
} from "../imagePreload";
import { ocnoerTheme, ocnoerWebPlayer } from "../../ui/theme";
import {
  DirectionalSlideView,
  FadeInView,
  StageScrims
} from "./NativeCinematic";

function NativeCachedImage(props: {
  accessibilityLabel?: string;
  contentFit: "cover" | "contain";
  contentPosition?: "left bottom" | "right bottom" | "center";
  imageUrl: string;
  style: StyleProp<ImageStyle>;
}) {
  const imageRef = usePreloadedReaderImageRef(props.imageUrl);
  const source = createCachedReaderImageSource(props.imageUrl);

  if (!source) {
    return <View style={[props.style, styles.missingAsset]} />;
  }

  return (
    <ExpoImage
      accessibilityLabel={props.accessibilityLabel}
      accessible={Boolean(props.accessibilityLabel)}
      cachePolicy="memory-disk"
      contentFit={props.contentFit}
      contentPosition={props.contentPosition ?? "center"}
      priority="high"
      recyclingKey={props.imageUrl}
      source={imageRef ?? source}
      style={props.style}
      transition={0}
    />
  );
}

function CachedPortraitAsset(props: {
  accessibilityLabel: string;
  imageUrl: string;
  side: "left" | "right";
}) {
  const renderKind = getAssetRenderKind(props.imageUrl);
  const svgAst = usePreloadedReaderSvgAst(props.imageUrl);
  const preserveAspectRatio =
    props.side === "left" ? "xMinYMax meet" : "xMaxYMax meet";
  const svgProps = {
    height: "100%",
    preserveAspectRatio,
    width: "100%"
  };

  if (renderKind !== "svg-vector") {
    return (
      <View
        accessibilityLabel={props.accessibilityLabel}
        accessible
        pointerEvents="none"
        style={styles.portraitSvg}
      >
        <NativeCachedImage
          accessibilityLabel={props.accessibilityLabel}
          contentFit="contain"
          contentPosition={
            props.side === "left" ? "left bottom" : "right bottom"
          }
          imageUrl={props.imageUrl}
          style={styles.portraitBitmap}
        />
      </View>
    );
  }

  return (
    <View
      accessibilityLabel={props.accessibilityLabel}
      accessible
      pointerEvents="none"
      style={styles.portraitSvg}
    >
      {svgAst ? <SvgAst ast={svgAst} override={svgProps} /> : null}
    </View>
  );
}

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
        <CachedPortraitAsset
          accessibilityLabel={props.portrait.label}
          imageUrl={props.portrait.imageUrl}
          side={props.side}
        />
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
          key={props.presentation.backgroundImageUrl}
          animationKey={props.presentation.backgroundImageUrl}
          durationMs={ocnoerTheme.motion.stageFadeMs}
          style={styles.stageBackgroundFade}
        >
          <NativeCachedImage
            contentFit="cover"
            imageUrl={props.presentation.backgroundImageUrl}
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
  portraitBitmap: {
    height: "100%",
    width: "100%"
  },
  missingAsset: {
    backgroundColor: "transparent"
  }
});
