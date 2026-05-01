"use client";

import { useEffect } from "react";

const PLAYER_PRESENCE_HEARTBEAT_MS = 60 * 1000;

function sendPlayerPresenceHeartbeat() {
  void fetch("/api/player/activity", {
    method: "POST",
    cache: "no-store",
    credentials: "same-origin"
  }).catch(() => undefined);
}

export function PlayerPresenceHeartbeat() {
  useEffect(() => {
    sendPlayerPresenceHeartbeat();

    const interval = window.setInterval(
      sendPlayerPresenceHeartbeat,
      PLAYER_PRESENCE_HEARTBEAT_MS
    );
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        sendPlayerPresenceHeartbeat();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return null;
}
