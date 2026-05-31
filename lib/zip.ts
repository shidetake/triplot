// 依存ゼロの最小 ZIP 書き出し（無圧縮 = store 法）。KMZ（KML＋画像を1ファイルに
// まとめた zip）の生成に使う。圧縮はしない（KMZ は画像が主で、テキストの KML も
// 数十KB 程度。圧縮ライブラリを足すより無圧縮で十分）。
//
// ZIP 仕様（PKWARE APPNOTE）の最低限だけ実装: ローカルファイルヘッダ →
// データ → セントラルディレクトリ → End Of Central Directory。すべて
// リトルエンディアン。

export type ZipEntry = { name: string; data: Uint8Array };

// CRC-32（IEEE, 反転多項式 0xEDB88320）。ZIP の各エントリに必要。
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

const utf8 = (s: string) => new TextEncoder().encode(s);

// store 法で zip を組み立てて Uint8Array を返す。
// バイトは plain number[] に push していく（u16/u32 はリトルエンディアン）。
export function buildZip(entries: ZipEntry[]): Uint8Array {
  const out: number[] = [];
  const u16 = (n: number) => out.push(n & 0xff, (n >>> 8) & 0xff);
  const u32 = (n: number) =>
    out.push(
      n & 0xff,
      (n >>> 8) & 0xff,
      (n >>> 16) & 0xff,
      (n >>> 24) & 0xff,
    );
  const bytes = (b: Uint8Array) => {
    for (let i = 0; i < b.length; i++) out.push(b[i]);
  };

  const central: {
    name: Uint8Array;
    crc: number;
    size: number;
    offset: number;
  }[] = [];

  for (const e of entries) {
    const name = utf8(e.name);
    const crc = crc32(e.data);
    const offset = out.length;
    // ローカルファイルヘッダ
    u32(0x04034b50);
    u16(20); // version needed
    u16(0); // flags
    u16(0); // method = 0 (store)
    u16(0); // mod time
    u16(0); // mod date
    u32(crc);
    u32(e.data.length); // compressed size
    u32(e.data.length); // uncompressed size
    u16(name.length);
    u16(0); // extra length
    bytes(name);
    bytes(e.data);
    central.push({ name, crc, size: e.data.length, offset });
  }

  const cdStart = out.length;
  for (const c of central) {
    u32(0x02014b50);
    u16(20); // version made by
    u16(20); // version needed
    u16(0); // flags
    u16(0); // method
    u16(0); // mod time
    u16(0); // mod date
    u32(c.crc);
    u32(c.size); // compressed
    u32(c.size); // uncompressed
    u16(c.name.length);
    u16(0); // extra length
    u16(0); // comment length
    u16(0); // disk number start
    u16(0); // internal attrs
    u32(0); // external attrs
    u32(c.offset);
    bytes(c.name);
  }
  const cdSize = out.length - cdStart;

  // End Of Central Directory
  u32(0x06054b50);
  u16(0); // disk number
  u16(0); // disk with cd
  u16(central.length); // entries this disk
  u16(central.length); // total entries
  u32(cdSize);
  u32(cdStart);
  u16(0); // comment length

  // ArrayBuffer 裏付けの Uint8Array を返す（Blob/BlobPart 互換のため）。
  const result = new Uint8Array(out.length);
  result.set(out);
  return result;
}
