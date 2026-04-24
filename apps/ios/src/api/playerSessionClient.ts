import { createMobileApiClient, type MobileApiClient } from "./mobileApiClient";
import type {
  MobileCatNamePayload,
  MobilePlayerProfilePayload,
  MobilePlayerSessionPayload
} from "./playerSessionTypes";

export type PlayerSessionClient = {
  signIn: (secret: string) => Promise<MobilePlayerSessionPayload>;
  validateSession: (token: string) => Promise<MobilePlayerSessionPayload>;
  signOut: (token: string) => Promise<void>;
  getProfile: (token: string) => Promise<MobilePlayerProfilePayload>;
  updateCatName: (
    token: string,
    catName: string
  ) => Promise<MobileCatNamePayload>;
};

export function createPlayerSessionClient(
  apiClient: MobileApiClient = createMobileApiClient()
): PlayerSessionClient {
  return {
    signIn: (secret) =>
      apiClient.requestJson<MobilePlayerSessionPayload>(
        "/api/mobile/player/session",
        {
          method: "POST",
          body: {
            secret
          }
        }
      ),
    validateSession: (token) =>
      apiClient.requestJson<MobilePlayerSessionPayload>(
        "/api/mobile/player/session",
        {
          token
        }
      ),
    signOut: async (token) => {
      await apiClient.requestJson<{ ok: boolean }>(
        "/api/mobile/player/session",
        {
          method: "DELETE",
          token
        }
      );
    },
    getProfile: (token) =>
      apiClient.requestJson<MobilePlayerProfilePayload>(
        "/api/mobile/player/profile",
        {
          token
        }
      ),
    updateCatName: (token, catName) =>
      apiClient.requestJson<MobileCatNamePayload>(
        "/api/mobile/player/profile/cat-name",
        {
          method: "PATCH",
          token,
          body: {
            catName
          }
        }
      )
  };
}
