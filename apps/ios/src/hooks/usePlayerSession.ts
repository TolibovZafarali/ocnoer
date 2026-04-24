import { useCallback, useEffect, useRef, useState } from "react";

import { MobileApiError } from "../api/mobileApiClient";
import type {
  MobilePlayer,
  MobilePlayerSessionPayload
} from "../api/playerSessionTypes";
import { createPlayerSessionClient } from "../api/playerSessionClient";
import {
  clearStoredPlayerSession,
  loadStoredPlayerSession,
  saveStoredPlayerSession,
  type StoredPlayerSession
} from "../storage/playerSessionStorage";

type SignedOutState = {
  status: "signed-out";
  error: string | null;
  isSubmitting: boolean;
};

type SignedInState = {
  status: "signed-in";
  storedSession: StoredPlayerSession;
  error: string | null;
  isSubmitting: boolean;
};

export type PlayerSessionState =
  | {
      status: "restoring";
    }
  | SignedOutState
  | SignedInState;

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof MobileApiError) {
    return error.message;
  }

  return error instanceof Error ? error.message : fallback;
}

export function usePlayerSession() {
  const mountedRef = useRef(true);
  const [state, setState] = useState<PlayerSessionState>({
    status: "restoring"
  });

  const setMountedState = useCallback((nextState: PlayerSessionState) => {
    if (mountedRef.current) {
      setState(nextState);
    }
  }, []);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    async function restoreSession() {
      try {
        const storedSession = await loadStoredPlayerSession();

        if (!storedSession) {
          setMountedState({
            status: "signed-out",
            error: null,
            isSubmitting: false
          });
          return;
        }

        const validated = await createPlayerSessionClient().validateSession(
          storedSession.session.token
        );
        const refreshedSession = await saveStoredPlayerSession(validated);

        setMountedState({
          status: "signed-in",
          storedSession: refreshedSession,
          error: null,
          isSubmitting: false
        });
      } catch (error) {
        await clearStoredPlayerSession();
        setMountedState({
          status: "signed-out",
          error:
            error instanceof MobileApiError && error.status === 401
              ? null
              : getErrorMessage(error, "Unable to restore the mobile session."),
          isSubmitting: false
        });
      }
    }

    void restoreSession();
  }, [setMountedState]);

  const signIn = useCallback(
    async (secret: string) => {
      setMountedState({
        status: "signed-out",
        error: null,
        isSubmitting: true
      });

      try {
        const payload = await createPlayerSessionClient().signIn(secret);
        const storedSession = await saveStoredPlayerSession(payload);

        setMountedState({
          status: "signed-in",
          storedSession,
          error: null,
          isSubmitting: false
        });
      } catch (error) {
        setMountedState({
          status: "signed-out",
          error: getErrorMessage(error, "Unable to sign in right now."),
          isSubmitting: false
        });
      }
    },
    [setMountedState]
  );

  const signOut = useCallback(async () => {
    const token =
      state.status === "signed-in" ? state.storedSession.session.token : null;

    if (state.status === "signed-in") {
      setMountedState({
        ...state,
        error: null,
        isSubmitting: true
      });
    }

    if (token) {
      await createPlayerSessionClient()
        .signOut(token)
        .catch(() => undefined);
    }

    await clearStoredPlayerSession();
    setMountedState({
      status: "signed-out",
      error: null,
      isSubmitting: false
    });
  }, [setMountedState, state]);

  const replacePlayer = useCallback(
    async (player: MobilePlayer) => {
      if (state.status !== "signed-in") {
        return;
      }

      const payload: MobilePlayerSessionPayload = {
        session: state.storedSession.session,
        player
      };
      const storedSession = await saveStoredPlayerSession(payload);

      setMountedState({
        ...state,
        storedSession
      });
    },
    [setMountedState, state]
  );

  return {
    state,
    signIn,
    signOut,
    replacePlayer
  };
}
