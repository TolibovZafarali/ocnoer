import { useCallback, useEffect, useRef, useState } from "react";
import { StatusBar } from "expo-status-bar";

import type { PlayerProgress } from "@ocnoer/story-core";

import { createPlayerSessionClient } from "./src/api/playerSessionClient";
import { useAudioPreferences } from "./src/audio/useAudioPreferences";
import type { StoredPlayerSession } from "./src/storage/playerSessionStorage";
import { usePlayerSession } from "./src/hooks/usePlayerSession";
import { useRuntimeBootstrap } from "./src/hooks/useRuntimeBootstrap";
import { BootstrapScreen } from "./src/screens/BootstrapScreen";
import { ChapterPreviewScreen } from "./src/screens/ChapterPreviewScreen";
import { ReaderScreen } from "./src/screens/ReaderScreen";
import { RestoreSessionScreen } from "./src/screens/RestoreSessionScreen";
import { SignInScreen } from "./src/screens/SignInScreen";
import {
  clearSyncedPlayerProgress,
  loadSyncedPlayerProgress
} from "./src/sync/playerProgressSync";

type AuthenticatedRuntimeShellProps = {
  storedSession: StoredPlayerSession;
  isSigningOut: boolean;
  onPlayerUpdated: (player: StoredPlayerSession["player"]) => Promise<void>;
  onSignOut: () => void;
};

type AuthenticatedScreen =
  | {
      type: "home";
    }
  | {
      type: "preview";
      chapterId: string;
    }
  | {
      type: "reader";
    };

function AuthenticatedRuntimeShell(props: AuthenticatedRuntimeShellProps) {
  const { state, reload } = useRuntimeBootstrap();
  const audioPreferences = useAudioPreferences();
  const mountedRef = useRef(true);
  const [activeScreen, setActiveScreen] = useState<AuthenticatedScreen>({
    type: "home"
  });
  const [savedProgress, setSavedProgress] = useState<PlayerProgress | null>(
    null
  );
  const [isLoadingProgress, setIsLoadingProgress] = useState(true);
  const [isResettingProgress, setIsResettingProgress] = useState(false);
  const [progressSyncError, setProgressSyncError] = useState<string | null>(
    null
  );
  const [catNameError, setCatNameError] = useState<string | null>(null);
  const [isUpdatingCatName, setIsUpdatingCatName] = useState(false);
  const playerId = props.storedSession.player.id;
  const sessionToken = props.storedSession.session.token;

  const refreshSavedProgress = useCallback(async () => {
    setIsLoadingProgress(true);
    setProgressSyncError(null);

    try {
      const result = await loadSyncedPlayerProgress({
        playerId,
        token: sessionToken
      });

      if (mountedRef.current) {
        setSavedProgress(result.progress);
        setProgressSyncError(result.warning);
      }
    } catch (error) {
      if (mountedRef.current) {
        setSavedProgress(null);
        setProgressSyncError(
          error instanceof Error
            ? error.message
            : "Unable to check saved progress."
        );
      }
    } finally {
      if (mountedRef.current) {
        setIsLoadingProgress(false);
      }
    }
  }, [playerId, sessionToken]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    void refreshSavedProgress();
  }, [refreshSavedProgress]);

  async function updateCatName(
    catName: string,
    options: {
      rethrow?: boolean;
    } = {}
  ) {
    setIsUpdatingCatName(true);
    setCatNameError(null);

    try {
      const result = await createPlayerSessionClient().updateCatName(
        props.storedSession.session.token,
        catName
      );

      await props.onPlayerUpdated(result.player);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to save cat name.";

      setCatNameError(message);

      if (options.rethrow) {
        throw new Error(message);
      }
    } finally {
      setIsUpdatingCatName(false);
    }
  }

  async function resetProgress() {
    setIsResettingProgress(true);
    setProgressSyncError(null);

    try {
      await clearSyncedPlayerProgress({
        playerId,
        token: sessionToken
      });
      setSavedProgress(null);
    } catch (error) {
      setProgressSyncError(
        error instanceof Error ? error.message : "Unable to clear progress."
      );
    } finally {
      setIsResettingProgress(false);
    }
  }

  async function restartReading() {
    setIsResettingProgress(true);
    setProgressSyncError(null);

    try {
      await clearSyncedPlayerProgress({
        playerId,
        token: sessionToken
      });
      setSavedProgress(null);
      setActiveScreen({
        type: "reader"
      });
    } catch (error) {
      setProgressSyncError(
        error instanceof Error ? error.message : "Unable to restart reading."
      );
    } finally {
      setIsResettingProgress(false);
    }
  }

  function returnHomeFromReader() {
    setActiveScreen({
      type: "home"
    });
    void refreshSavedProgress();
  }

  if (state.status === "success" && activeScreen.type === "preview") {
    return (
      <ChapterPreviewScreen
        chapterId={activeScreen.chapterId}
        config={state.config}
        manifest={state.bootstrap.initialManifest}
        onBack={() =>
          setActiveScreen({
            type: "home"
          })
        }
      />
    );
  }

  if (state.status === "success" && activeScreen.type === "reader") {
    return (
      <ReaderScreen
        audioPreferences={audioPreferences.preferences}
        bootstrap={state.bootstrap}
        config={state.config}
        onToggleAudioMuted={audioPreferences.toggleMuted}
        onBackHome={returnHomeFromReader}
        onProgressSaved={() => undefined}
        onUpdateCatName={(catName) =>
          updateCatName(catName, {
            rethrow: true
          })
        }
        player={props.storedSession.player}
        sessionToken={sessionToken}
      />
    );
  }

  return (
    <BootstrapScreen
      catNameError={catNameError}
      audioPreferenceError={audioPreferences.error}
      audioPreferences={audioPreferences.preferences}
      isLoadingAudioPreferences={audioPreferences.isLoading}
      isLoadingProgress={isLoadingProgress}
      isResettingProgress={isResettingProgress}
      isUpdatingCatName={isUpdatingCatName}
      isSigningOut={props.isSigningOut}
      progressSyncError={progressSyncError}
      onContinueReading={() =>
        setActiveScreen({
          type: "reader"
        })
      }
      onOpenPreview={(chapterId) =>
        setActiveScreen({
          type: "preview",
          chapterId
        })
      }
      onRetry={reload}
      onToggleAudioMuted={audioPreferences.toggleMuted}
      onRestartReading={restartReading}
      onResetProgress={resetProgress}
      onSignOut={props.onSignOut}
      onUpdateCatName={(catName) => {
        void updateCatName(catName);
      }}
      player={props.storedSession.player}
      savedProgress={savedProgress}
      state={state}
    />
  );
}

export default function App() {
  const { state, signIn, signOut, replacePlayer } = usePlayerSession();

  if (state.status === "restoring") {
    return (
      <>
        <StatusBar style="light" />
        <RestoreSessionScreen />
      </>
    );
  }

  if (state.status === "signed-out") {
    return (
      <>
        <StatusBar style="light" />
        <SignInScreen
          error={state.error}
          isSubmitting={state.isSubmitting}
          onSignIn={signIn}
        />
      </>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <AuthenticatedRuntimeShell
        isSigningOut={state.isSubmitting}
        onPlayerUpdated={replacePlayer}
        onSignOut={signOut}
        storedSession={state.storedSession}
      />
    </>
  );
}
