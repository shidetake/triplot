import * as Crypto from "expo-crypto";

// 招待トークン生成（RN 版）。web の shared/invite.ts（node:crypto）と同じ
// 形式: 18 byte → base64url 24 文字。
export function generateInviteToken(): string {
  const bytes = Crypto.getRandomBytes(18);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  // btoa は Hermes にある。base64 → base64url。
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
