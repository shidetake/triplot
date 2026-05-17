// 招待トークン（サーバ専用。node:crypto を使うのでクライアントから import 不可）。
//
// 生トークンは DB に保存しない。URL に載せるのは生トークン、DB に入れるのは
// その sha256 ハッシュだけ。漏洩時もハッシュからは元トークンを復元できない。

import { createHash, randomBytes } from "node:crypto";

export function generateInviteToken(): string {
  // 18 byte → base64url 24 文字。総当たり困難な十分なエントロピー。
  return randomBytes(18).toString("base64url");
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
