declare const process: {
  env: {
    EXPO_PUBLIC_OCNOER_CONTENT_MODE?: string;
  };
};

export function isOfflineMode() {
  return process.env.EXPO_PUBLIC_OCNOER_CONTENT_MODE !== "remote";
}
