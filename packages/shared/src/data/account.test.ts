import { describe, expect, it } from "vitest";

import { pickProfileFromIdentities } from "./account";

describe("pickProfileFromIdentities", () => {
  it("Apple のみ（データ無し）は両方 null", () => {
    expect(
      pickProfileFromIdentities([
        { identity_data: { email: "a@example.com", sub: "000" } },
      ]),
    ).toEqual({ displayName: null, avatarUrl: null });
  });

  it("Google の name/avatar_url を拾う", () => {
    expect(
      pickProfileFromIdentities([
        {
          identity_data: {
            name: "山田 太郎",
            avatar_url: "https://example.com/a.png",
          },
        },
      ]),
    ).toEqual({ displayName: "山田", avatarUrl: "https://example.com/a.png" });
  });

  it("name が無ければ full_name、avatar_url が無ければ picture", () => {
    expect(
      pickProfileFromIdentities([
        {
          identity_data: {
            full_name: "Taro Yamada",
            picture: "https://example.com/p.png",
          },
        },
      ]),
    ).toEqual({ displayName: "Taro", avatarUrl: "https://example.com/p.png" });
  });

  it("複数 identity から項目ごとに最初に見つかったものを採用する", () => {
    expect(
      pickProfileFromIdentities([
        { identity_data: { email: "a@example.com" } }, // Apple: データ無し
        {
          identity_data: {
            name: "山田 太郎",
            avatar_url: "https://example.com/a.png",
          },
        }, // Google
      ]),
    ).toEqual({ displayName: "山田", avatarUrl: "https://example.com/a.png" });
  });

  it("全角スペース区切りの先頭トークンだけを表示名にする", () => {
    expect(
      pickProfileFromIdentities([{ identity_data: { name: "山田　太郎" } }]),
    ).toEqual({ displayName: "山田", avatarUrl: null });
  });

  it("identity が無い/空配列は両方 null", () => {
    expect(pickProfileFromIdentities(null)).toEqual({
      displayName: null,
      avatarUrl: null,
    });
    expect(pickProfileFromIdentities([])).toEqual({
      displayName: null,
      avatarUrl: null,
    });
  });
});
