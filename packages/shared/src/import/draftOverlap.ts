import type { EventDraftItem } from "./drafts";

// 未確定の予定下書きどうしが時間帯で重なったときの後始末。
//
// ■ なぜ要るか
//   レシートに書いてあるのは支払時刻だけで、終了時刻は LLM が「夕食なら2時間」
//   のように補っている（抽出スキーマは「不明は null」と指示しているが、実データは
//   49/50 に入っていて 2時間・1時間・30分ちょうどが並ぶ）。同じ晩に何度か払うと、
//   その推測どうしが重なってカレンダーが団子になる。
//
//   実データの例（同じ日の未確定4件が全部同じ店に解決されていた）:
//     15:25–17:25 "バー"   → Howzit Brewing
//     16:36–17:36 "バー"   → Howzit Brewing
//     16:54–17:54 "買い物" → Howzit Brewing
//     16:58–17:58 "買い物" → Howzit Brewing
//
// ■ 同一店の判定にタイトルを使わないこと
//   上の例のとおり、同じ店のレシートでもタイトルは「バー」「買い物」とばらける
//   （LLM が費用カテゴリ的な一般名詞を入れる）。逆に別の店が同じ「買い物」に
//   なることもある。**判定は場所の同一性だけ**で行い、場所が解決できていない
//   ものはマージしない。
//
// ■ 対象を timed に限る理由
//   allday（宿泊）と transit（フライト）は他の予定と重なるのが正常。宿泊を
//   夕食と重なったからといって切ってはいけない。
//
// LLM は使わない（純粋な計算のみ）。

const DAY_MIN = 1440;

function toMin(date: string, time: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return Date.UTC(y, m - 1, d) / 60000 + hh * 60 + mm;
}

function fromMin(total: number): { date: string; time: string } {
  const days = Math.floor(total / DAY_MIN);
  const mins = total - days * DAY_MIN;
  const date = new Date(days * DAY_MIN * 60000).toISOString().slice(0, 10);
  const pad = (n: number) => String(n).padStart(2, "0");
  return { date, time: `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}` };
}

// 場所の同一性。解決できないものは null＝マージの根拠にしない。
function placeKey(item: EventDraftItem): string | null {
  const p = item.prefill.place;
  if (!p) return null;
  if (p.kind === "saved") return `saved:${p.id}`;
  if (p.kind === "google") return `google:${p.placeId}`;
  return null;
}

function startMin(it: EventDraftItem): number {
  return toMin(it.date, it.time);
}
function endMin(it: EventDraftItem): number | null {
  const t = it.prefill.endTime;
  if (!t) return null;
  return toMin(it.prefill.endDate ?? it.date, t);
}

function isTarget(it: EventDraftItem): boolean {
  return it.prefill.kind3 === "timed" && endMin(it) !== null;
}

// 「買い物」系のタイトルは最後に回す。飲食店で食べたあと同じ店の物販で払う、が
// よくある形で、まとめた1件の見出しとしては「夕食」「カフェ」の方が実態に近い
// （同じ店の複数レシートなのでタイトルだけがばらける）。
//
// LLM が付ける見出しに対する経験則なので、外れる語が出てきたらここに足す。
// 中身の判定には使わない（同一店かどうかは場所だけで見る）ので、外しても
// マージの正しさには影響せず、見出しの選び方が変わるだけ。
const LOW_PRIORITY_TITLES = ["買い物", "土産", "ショッピング", "物販"];

function isLowPriorityTitle(title: string): boolean {
  const t = title.trim();
  return LOW_PRIORITY_TITLES.some((w) => t.includes(w));
}

// まとめた1件の見出し。優先度の低い語しか無ければ先に始まった方を残す。
function pickMergedTitle(earlier: string, later: string): string {
  if (isLowPriorityTitle(earlier) && !isLowPriorityTitle(later)) return later;
  return earlier;
}

function joinNotes(a: string | null, b: string | null): string | null {
  const parts = [a, b].filter((s): s is string => !!s);
  const uniq = [...new Set(parts)];
  return uniq.length > 0 ? uniq.join(" ・ ") : null;
}

/**
 * 重なった未確定の予定下書きを整える。
 *  - 同じ場所どうし → 1件にまとめる（時間帯は和集合、下書き id は全部持つ）
 *  - 違う場所どうし → 重なり区間の中点で切って重ならないようにする
 *
 * @param formatWhen ラベルの日時部分の作り直し（開始が動いたときだけ使う）
 */
export function resolveDraftOverlaps(
  items: EventDraftItem[],
  formatWhen: (date: string, time: string) => string,
): EventDraftItem[] {
  const targets = items.filter(isTarget);
  if (targets.length < 2) return items;

  // タイムゾーンが違うものを壁時計で比べても意味がないので、tz ごとに独立に処理する。
  const byTz = new Map<string, EventDraftItem[]>();
  for (const it of targets) {
    const arr = byTz.get(it.tz) ?? [];
    arr.push(it);
    byTz.set(it.tz, arr);
  }

  // 元の id → 加工後（マージで消えたものは null）
  const result = new Map<string, EventDraftItem | null>();

  for (const group of byTz.values()) {
    const byStart = (a: EventDraftItem, b: EventDraftItem) =>
      startMin(a) - startMin(b) || (endMin(a) ?? 0) - (endMin(b) ?? 0);

    // --- 1. まず同じ場所どうしを全部まとめる ---
    // 「隣どうしを1回だけ見る」だと、間に別の店が挟まった時に同じ店が繋がらない
    // （実データで Howzit → Village → Howzit の並びが2つに割れた）。同一店の
    // まとめはずらしより優先されるべきなので、変化が無くなるまで繰り返す。
    let merged: EventDraftItem[] = [...group].sort(byStart).map((it) => ({
      ...it,
      prefill: { ...it.prefill },
      draftIds: [...it.draftIds],
    }));
    for (let changed = true; changed;) {
      changed = false;
      outer: for (let i = 0; i < merged.length; i++) {
        for (let j = i + 1; j < merged.length; j++) {
          const a = merged[i];
          const b = merged[j];
          const ak = placeKey(a);
          if (ak === null || ak !== placeKey(b)) continue;
          // 重なっていない同一店は別々の訪問なので触らない。
          if (startMin(b) >= endMin(a)! || startMin(a) >= endMin(b)!) continue;

          const e = fromMin(Math.max(endMin(a)!, endMin(b)!));
          a.prefill.endDate = e.date === a.date ? null : e.date;
          a.prefill.endTime = e.time;
          a.prefill.note = joinNotes(a.prefill.note, b.prefill.note);
          const title = pickMergedTitle(a.prefill.title, b.prefill.title);
          a.prefill.title = title;
          a.labelParts = [title, a.labelParts[1] ?? ""];
          a.draftIds.push(...b.draftIds);
          result.set(b.id, null); // 表示からは消える
          merged.splice(j, 1);
          changed = true;
          break outer;
        }
      }
    }

    // --- 2. 残った（＝場所が違う or 場所不明の）重なりを中点で切る ---
    merged = merged.sort(byStart);
    for (let i = 1; i < merged.length; i++) {
      const prev = merged[i - 1];
      const cur = merged[i];
      const pe = endMin(prev)!;
      const cs = startMin(cur);
      const ce = endMin(cur)!;
      if (cs >= pe) continue;

      const mid = Math.floor((cs + Math.min(pe, ce)) / 2);
      const pEnd = fromMin(mid);
      prev.prefill.endDate = pEnd.date === prev.date ? null : pEnd.date;
      prev.prefill.endTime = pEnd.time;

      const cStart = fromMin(mid);
      cur.date = cStart.date;
      cur.time = cStart.time;
      // ラベルは「日付 開始時刻」なので、開始が動いたここだけ作り直す。
      cur.labelParts = [
        cur.labelParts[0] ?? "",
        formatWhen(cStart.date, cStart.time),
      ];
    }

    for (const it of merged) result.set(it.id, it);
  }

  // 元の並び順を保つ（マージで消えたものだけ落とす）。
  return items.flatMap((it) => {
    if (!result.has(it.id)) return [it];
    const v = result.get(it.id);
    return v ? [v] : [];
  });
}
