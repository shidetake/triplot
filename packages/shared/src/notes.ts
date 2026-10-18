import { LinkifyIt } from "linkify-it";

// ノート（旅行の中に貯めておく雑多な情報やメモ）の表示の決まり。
//
// **ノートが持つのはプレーンテキストだけで、記法は持たない。** 表示で手を
// 加えるのは2つだけ:
//   - 1行目をタイトルとして扱う（iOS のメモ帳と同じ）
//   - 本文中の URL を押せるようにする
// 太字・見出し・`[文字](URL)` のような書き方は入れない（入れ始めると
// 「あれもこれも」になる。プレーンテキストのままならコピーや書き出しも素直）。

// 編集中の端末がロックの期限を延ばす間隔。期限そのもの（2分）は DB 側
// （note_lock_lease）。延ばしが1〜2回落ちても期限内に収まる間隔にしてある。
export const NOTE_LOCK_RENEW_MS = 30_000;

export type NoteRow = {
  id: string;
  body: string;
  visibility: "shared" | "private";
  createdByMemberId: string;
  updatedAt: string;
  // 期限内のロックを持っている人（自分を含む）。期限切れは null に読み替える。
  lockedByMemberId: string | null;
};

type NoteRaw = {
  id: string;
  body: string;
  visibility: string;
  created_by_member_id: string;
  updated_at: string;
  locked_by_member_id: string | null;
  lock_expires_at: string | null;
};

// 一覧は選ぶための一覧なので新しい順（最後に書き換えたものが先頭。
// ui-guidelines「一覧の並び順は『選ぶ一覧』か『読む中身』かで決まる」）。
export function deriveNotes(
  raw: NoteRaw[] | null | undefined,
  now: Date = new Date(),
): NoteRow[] {
  return (raw ?? [])
    .map((n) => ({
      id: n.id,
      body: n.body,
      visibility: n.visibility as NoteRow["visibility"],
      createdByMemberId: n.created_by_member_id,
      updatedAt: n.updated_at,
      lockedByMemberId:
        n.locked_by_member_id &&
        n.lock_expires_at &&
        new Date(n.lock_expires_at) > now
          ? n.locked_by_member_id
          : null,
    }))
    .sort((a, b) =>
      a.updatedAt === b.updatedAt
        ? a.id.localeCompare(b.id)
        : a.updatedAt < b.updatedAt
          ? 1
          : -1,
    );
}

function lines(body: string): string[] {
  return body
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== "");
}

// タイトル＝空でない最初の行。
export function noteTitle(body: string): string {
  return lines(body)[0] ?? "";
}

// 一覧の2行目に薄く出す、タイトルの次の行（開かなくても中身の見当が付くように）。
// URL だけの行はドメインに縮める（長い URL で行が埋まらないように）。
export function notePreview(body: string): string {
  const next = lines(body)[1];
  if (!next) return "";
  const links = findLinks(next);
  if (links.length === 1 && links[0].start === 0 && links[0].end === next.length) {
    try {
      return new URL(links[0].url).host;
    } catch {
      return next;
    }
  }
  return next;
}

export type NoteSegment =
  | { kind: "text"; text: string }
  | { kind: "link"; text: string; url: string };

type LinkMatch = { start: number; end: number; url: string };

// http/https だけ（下の findLinks が `http(s)://` の位置でしか聞かないので、
// ほかの種類は出てこない）。`example.com` のような頭の無いもの（fuzzy）は
// 拾わない（「Node.js」「ver.2」のような普通の文字を取り違えるため）。
const linkify = new LinkifyIt({
  fuzzyLink: false,
  fuzzyEmail: false,
  fuzzyIP: false,
});

const SCHEME = /https?:\/\//g;

// URL の位置は自分で探し、終わりの見極めだけを linkify-it に任せる。
// linkify-it に全文を渡すと、直前に空白の無い URL（「シャトルhttps://…」）を
// 見つけない（英文の単語区切りが前提）。日本語では空白を置かないのが普通なので、
// `http(s)://` の位置から始まる URL として読ませる。終わりの見極め（「。」
// 「）」「」」を含めない、Wikipedia の `_(national_park)` は含める）は
// linkify-it のもの。
function findLinks(text: string): LinkMatch[] {
  const out: LinkMatch[] = [];
  let from = 0;
  for (const m of text.matchAll(SCHEME)) {
    const at = m.index;
    if (at < from) continue;
    const hit = linkify.matchAtStart(text.slice(at));
    if (!hit) continue;
    out.push({ start: at + hit.index, end: at + hit.lastIndex, url: hit.url });
    from = at + hit.lastIndex;
  }
  return out;
}

// 本文を「文字・URL・文字…」に切り分ける（表示側はリンクの部分だけを
// 押せる部品で描く）。改行はそのまま文字に残す。
export function noteSegments(body: string): NoteSegment[] {
  const out: NoteSegment[] = [];
  let pos = 0;
  for (const l of findLinks(body)) {
    if (l.start > pos) out.push({ kind: "text", text: body.slice(pos, l.start) });
    out.push({ kind: "link", text: body.slice(l.start, l.end), url: l.url });
    pos = l.end;
  }
  if (pos < body.length) out.push({ kind: "text", text: body.slice(pos) });
  return out;
}
