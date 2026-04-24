import { useState } from "react";
import { StatusBar } from "expo-status-bar";

import { createPlayerSessionClient } from "./src/api/playerSessionClient";
import type { StoredPlayerSession } from "./src/storage/playerSessionStorage";
import { usePlayerSession } from "./src/hooks/usePlayerSession";
import { useRuntimeBootstrap } from "./src/hooks/useRuntimeBootstrap";
import { BootstrapScreen } from "./src/screens/BootstrapScreen";
import { ChapterPreviewScreen } from "./src/screens/ChapterPreviewScreen";
import { RestoreSessionScreen } from "./src/screens/RestoreSessionScreen";
import { SignInScreen } from "./src/screens/SignInScreen";

type AuthenticatedRuntimeShellProps = {
  storedSession: StoredPlayerSession;
  isSigningOut: boolean;
  onPlayerUpdated: (player: StoredPlayerSession["player"]) => Promise<void>;
  onSignOut: () => void;
};

function AuthenticatedRuntimeShell(props: AuthenticatedRuntimeShellProps) {
  const { state, reload } = useRuntimeBootstrap();
  const [previewChapterId, setPreviewChapterId] = useState<string | null>(null);
  const [catNameError, setCatNameError] = useState<string | null>(null);
  const [isUpdatingCatName, setIsUpdatingCatName] = useState(false);

  async function updateCatName(catName: string) {
    setIsUpdatingCatName(true);
    setCatNameError(null);

    try {
      const result = await createPlayerSessionClient().updateCatName(
        props.storedSession.session.token,
        catName
      );

      await props.onPlayerUpdated(result.player);
    } catch (error) {
      setCatNameError(
        error instanceof Error ? error.message : "Unable to save cat name."
      );
    } finally {
      setIsUpdatingCatName(false);
    }
  }

  if (state.status === "success" && previewChapterId) {
    return (
      <ChapterPreviewScreen
        chapterId={previewChapterId}
        config={state.config}
        manifest={state.bootstrap.initialManifest}
        onBack={() => setPreviewChapterId(null)}
      />
    );
  }

  return (
    <BootstrapScreen
      catNameError={catNameError}
      isUpdatingCatName={isUpdatingCatName}
      isSigningOut={props.isSigningOut}
      onOpenPreview={setPreviewChapterId}
      onRetry={reload}
      onSignOut={props.onSignOut}
      onUpdateCatName={updateCatName}
      player={props.storedSession.player}
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
