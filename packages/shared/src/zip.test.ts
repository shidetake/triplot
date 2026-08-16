import { describe, it, expect } from "vitest";
import { inflateRawSync, gunzipSync } from "node:zlib";

import { buildZip, crc32 } from "./zip";

const enc = (s: string) => new TextEncoder().encode(s);
const u16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const u32 = (b: Uint8Array, o: number) =>
  (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

describe("crc32", () => {
  it("既知ベクタ: '123456789' = 0xCBF43926", () => {
    expect(crc32(enc("123456789"))).toBe(0xcbf43926);
  });

  it("空入力は 0", () => {
    expect(crc32(new Uint8Array(0))).toBe(0);
  });
});

describe("buildZip", () => {
  it("ローカルヘッダと EOCD のシグネチャを持つ", () => {
    const zip = buildZip([{ name: "a.txt", data: enc("hi") }]);
    expect(u32(zip, 0)).toBe(0x04034b50); // local file header
    // EOCD は末尾22バイト（コメント無し）
    expect(u32(zip, zip.length - 22)).toBe(0x06054b50);
  });

  it("エントリ数が EOCD に反映される", () => {
    const zip = buildZip([
      { name: "a", data: enc("x") },
      { name: "files/b.png", data: enc("yy") },
    ]);
    expect(u16(zip, zip.length - 22 + 10)).toBe(2); // total entries
  });

  it("store 法（無圧縮）でデータがそのまま入る", () => {
    const zip = buildZip([{ name: "a.txt", data: enc("hello") }]);
    // method=0 (store) at local header offset 8
    expect(u16(zip, 8)).toBe(0);
    // filename length / extra length
    const nameLen = u16(zip, 26);
    const extraLen = u16(zip, 28);
    const dataStart = 30 + nameLen + extraLen;
    const data = zip.slice(dataStart, dataStart + 5);
    expect(new TextDecoder().decode(data)).toBe("hello");
  });

  it("CRC がローカルヘッダに書かれる", () => {
    const zip = buildZip([{ name: "a", data: enc("123456789") }]);
    expect(u32(zip, 14)).toBe(0xcbf43926); // crc field
  });

  it("zlib で raw-inflate せず store のまま読める（健全性）", () => {
    // store はそのままバイトが入っているだけなので、deflate ではない。
    // 念のため gunzip/inflate が「効かない（=圧縮されていない）」ことを確認。
    const zip = buildZip([{ name: "a", data: enc("plain") }]);
    expect(() => gunzipSync(Buffer.from(zip))).toThrow();
    expect(() => inflateRawSync(Buffer.from(zip))).toThrow();
  });
});
