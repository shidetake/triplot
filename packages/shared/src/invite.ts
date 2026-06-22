// 招待トークン生成（サーバ専用。node:crypto を使うのでクライアント不可）。
//
// トークンは「旅行に参加」しかできない低リスクな共有リンク。Notion 等と同様、
// 1旅行=1本で DB に保持し、いつでも再表示／再生成できる。秘匿性より使い勝手。

import { randomBytes } from "node:crypto";

export function generateInviteToken(): string {
  // 18 byte → base64url 24 文字。総当たり困難な十分なエントロピー。
  return randomBytes(18).toString("base64url");
}
