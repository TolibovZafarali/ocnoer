export type MobilePlayer = {
  id: string;
  firstName: string;
  catName: string | null;
  catNameLocked: boolean;
};

export type MobilePlayerSession = {
  token: string;
  expiresAt: string;
};

export type MobilePlayerSessionPayload = {
  session: MobilePlayerSession;
  player: MobilePlayer;
};

export type MobilePlayerProfilePayload = {
  player: MobilePlayer;
};

export type MobileCatNamePayload = {
  updated: boolean;
  player: MobilePlayer;
};
