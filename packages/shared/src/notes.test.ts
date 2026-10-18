import { describe, expect, it } from "vitest";

import { deriveNotes, notePreview, noteSegments, noteTitle } from "./notes";

const links = (body: string) =>
  noteSegments(body)
    .filter((s) => s.kind === "link")
    .map((s) => s.text);

describe("noteSegments", () => {
  it("日本語の句読点・括弧を URL に含めない", () => {
    expect(links("詳しくは https://example.com/trail。次へ")).toEqual([
      "https://example.com/trail",
    ]);
    expect(links("（https://example.com）")).toEqual(["https://example.com"]);
    expect(links("「https://a.com/q」")).toEqual(["https://a.com/q"]);
  });

  it("直前に空白が無い URL も見つける", () => {
    expect(links("シャトルhttps://a.com/x?y=1&z=2、バス")).toEqual([
      "https://a.com/x?y=1&z=2",
    ]);
  });

  it("URL の一部としての括弧は含める", () => {
    expect(
      links("https://en.wikipedia.org/wiki/Yosemite_(national_park) です"),
    ).toEqual(["https://en.wikipedia.org/wiki/Yosemite_(national_park)"]);
  });

  it("頭の無いもの・http(s) 以外は拾わない", () => {
    expect(links("example.com と Node.js")).toEqual([]);
    expect(links("mailto:a@b.com ftp://a.com")).toEqual([]);
    expect(links("https://")).toEqual([]);
  });

  it("文字とリンクを並べ直すと元の本文に戻る", () => {
    const body = "トレイル\nhttps://a.com と https://b.com/x。\n終わり";
    expect(noteSegments(body).map((s) => s.text).join("")).toBe(body);
    expect(links(body)).toEqual(["https://a.com", "https://b.com/x"]);
  });
});

describe("noteTitle / notePreview", () => {
  it("空でない最初の行がタイトル、次の行がプレビュー", () => {
    const body = "\n  ヨセミテ  \n\nシャトルの時刻表\n…";
    expect(noteTitle(body)).toBe("ヨセミテ");
    expect(notePreview(body)).toBe("シャトルの時刻表");
  });

  it("URL だけの行はドメインに縮める", () => {
    expect(notePreview("行き方\nhttps://www.nps.gov/yose/planyourvisit/")).toBe(
      "www.nps.gov",
    );
    expect(notePreview("行き方\n公式 https://www.nps.gov/yose/")).toBe(
      "公式 https://www.nps.gov/yose/",
    );
  });

  it("1行だけならプレビューは空", () => {
    expect(notePreview("ヨセミテ")).toBe("");
  });
});

describe("deriveNotes", () => {
  const base = {
    body: "a",
    visibility: "shared",
    created_by_member_id: "m1",
    locked_by_member_id: null,
    lock_expires_at: null,
  };

  it("最後に書き換えた順に並べる", () => {
    const rows = deriveNotes([
      { ...base, id: "old", updated_at: "2026-10-01T00:00:00Z" },
      { ...base, id: "new", updated_at: "2026-10-02T00:00:00Z" },
    ]);
    expect(rows.map((r) => r.id)).toEqual(["new", "old"]);
  });

  it("期限切れのロックは無いものとして扱う", () => {
    const now = new Date("2026-10-18T00:00:00Z");
    const rows = deriveNotes(
      [
        {
          ...base,
          id: "live",
          updated_at: "2026-10-01T00:00:00Z",
          locked_by_member_id: "m2",
          lock_expires_at: "2026-10-18T00:01:00Z",
        },
        {
          ...base,
          id: "stale",
          updated_at: "2026-10-01T00:00:00Z",
          locked_by_member_id: "m2",
          lock_expires_at: "2026-10-17T23:59:00Z",
        },
      ],
      now,
    );
    expect(rows.find((r) => r.id === "live")?.lockedByMemberId).toBe("m2");
    expect(rows.find((r) => r.id === "stale")?.lockedByMemberId).toBeNull();
  });
});
