import { useEffect } from "react";
import { Image } from "react-native";

const PRELOAD_TIMEOUT_MS = 3500;
const attemptedImageUrls = new Set<string>();
const inFlightPreloads = new Map<string, Promise<void>>();

function isRemoteImageUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function withTimeout(promise: Promise<unknown>) {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, PRELOAD_TIMEOUT_MS);

    promise
      .catch(() => undefined)
      .then(() => {
        clearTimeout(timer);
        resolve();
      });
  });
}

export function preloadReaderImageUrls(imageUrls: string[]) {
  const uniqueImageUrls = Array.from(new Set(imageUrls)).filter(
    (imageUrl) => imageUrl.length > 0 && isRemoteImageUrl(imageUrl)
  );

  return Promise.all(
    uniqueImageUrls.map((imageUrl) => {
      if (attemptedImageUrls.has(imageUrl)) {
        return Promise.resolve();
      }

      const existingPreload = inFlightPreloads.get(imageUrl);

      if (existingPreload) {
        return existingPreload;
      }

      const preload = withTimeout(Image.prefetch(imageUrl)).finally(() => {
        attemptedImageUrls.add(imageUrl);
        inFlightPreloads.delete(imageUrl);
      });

      inFlightPreloads.set(imageUrl, preload);
      return preload;
    })
  ).then(() => undefined);
}

export function useReaderImagePreload(imageUrls: string[]) {
  const preloadKey = imageUrls.join("|");

  useEffect(() => {
    if (imageUrls.length === 0) {
      return;
    }

    void preloadReaderImageUrls(imageUrls);
  }, [imageUrls, preloadKey]);
}
