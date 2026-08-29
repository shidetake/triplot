import type { EventDraftItem } from "./drafts";
import { normalizeMerchant } from "./merchantName";

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

// 場所の同一性。
//
// 解決済みの場所（保存済み・Google）が第一。解決できていない時だけ、**店名の
// 完全一致**に落とす。銀行の利用通知は店名しか持たず（住所も支払時刻も無い）、
// 地理バイアスが作れない時期に取り込むと場所が解決できない。それでも同じ晩の
// 同じ店なのは店名で分かるので、団子のまま置いておく理由が無い。
//
// **完全一致でしか使わない**（normalizeMerchant 参照）。部分一致にすると
// "ABC #78" と "ABC #31" が同じ店になる。逆に途中で切れた表記は一致しないが、
// 取りこぼす方に倒す — 間違ってまとめると元に戻せない。
//
// 解決済みと未解決は混ぜない（別のキー空間にする）。同じ店でも片方だけ解決して
// いる時にまとめると、まとめた1件がどちらの場所を名乗るのかが決まらない。
function placeKey(item: EventDraftItem): string | null {
  const p = item.prefill.place;
  if (p?.kind === "saved") return `saved:${p.id}`;
  if (p?.kind === "google") return `google:${p.placeId}`;
  if (p) return null;
  const name = item.prefill.autoResolvePlace?.name;
  if (!name) return null;
  const key = normalizeMerchant(name);
  return key ? `name:${key}` : null;
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
 *    （前後は会計時刻で決める。順番が入れ替わる場合だけ中点を手前に下げない）
 *
 * @param formatWhen ラベルの日時部分の作り直し（開始が動いたときだけ使う）
 */
// 確定した予定＝**動かせない障害物**。
export type FixedBlock = {
  tz: string;
  // 壁時計 "YYYY-MM-DDTHH:MM"（下書き側と同じ土俵で比べるため文字列で受ける）。
  startAt: string;
  endAt: string;
  // 場所（`saved:<id>`）。同じ場所なら触らない。
  placeKey: string | null;
};

function blockMin(at: string): number {
  return toMin(at.slice(0, 10), at.slice(11, 16));
}

export function resolveDraftOverlaps(
  items: EventDraftItem[],
  formatWhen: (date: string, time: string) => string,
  // その下書きの会計時刻（分）。**重なりを解く時の前後はこれで決める**。
  // 開始時刻は所要時間の見積もりが入った推測値なので、それで並べると
  // 見積もりの長さが前後を決めてしまう。分からなければ null＝開始で代用。
  receiptMinOf: (it: EventDraftItem) => number | null = () => null,
  // 確定した予定。下書きはこれを避ける（下書きだけが動く）。
  fixed: FixedBlock[] = [],
): EventDraftItem[] {
  const targets = items.filter(isTarget);
  // 下書きが1件でも、確定した予定を避ける必要はある。
  if (targets.length === 0 || (targets.length < 2 && fixed.length === 0))
    return items;

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
      emailIds: [...it.emailIds],
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
          for (const e2 of b.emailIds)
            if (!a.emailIds.includes(e2)) a.emailIds.push(e2);
          result.set(b.id, null); // 表示からは消える
          merged.splice(j, 1);
          changed = true;
          break outer;
        }
      }
    }

    // --- 2. 残った（＝場所が違う or 場所不明の）重なりを中点で切る ---
    // 重なり区間の中点で分け、前の終了と後ろの開始をそこに揃える。
    //
    // **前後は会計時刻で決める。** 開始は所要時間の見積もりが入った推測値なので、
    // それで並べると「長く見積もられた方が先」になって実際の順番と食い違う
    // （実データ: 会計 17:12 の Village より、会計 17:25 の Howzit が2時間
    // 見積もりで 15:25 開始になっていた）。
    merged = merged.sort(
      (a, b) =>
        (receiptMinOf(a) ?? startMin(a)) - (receiptMinOf(b) ?? startMin(b)),
    );
    for (let i = 1; i < merged.length; i++) {
      const prev = merged[i - 1];
      const cur = merged[i];
      const pe = endMin(prev)!;
      const cs = startMin(cur);
      const ce = endMin(cur)!;
      if (cs >= pe) continue;

      const mid = Math.floor((cs + Math.min(pe, ce)) / 2);
      // 中点だけだと順番が入れ替わることがある（前が短く、後ろが大きく
      // 前倒しされていると中点が前の開始より手前に来る）。順番を崩さないのが
      // 最優先なので、そこまでは下げない。
      const cut = Math.min(Math.max(mid, startMin(prev)), ce);

      const at = fromMin(cut);
      prev.prefill.endDate = at.date === prev.date ? null : at.date;
      prev.prefill.endTime = at.time;

      cur.date = at.date;
      cur.time = at.time;
      // ラベルは「日付 開始時刻」なので、開始が動いたここだけ作り直す。
      cur.labelParts = [cur.labelParts[0] ?? "", formatWhen(at.date, at.time)];
    }

    // --- 3. 確定した予定を避ける ---
    //
    // **下書きだけが動く。** 確定した予定はユーザーが確認済みの本物の時刻なので
    // 中点で分けず、下書きの側を端まで切り詰める。
    //
    // これが無いと、重なった2件の片方を確定した瞬間にもう片方の調整が消える
    // （相手が下書きの集合から抜けて、切る根拠を失う）。実データ: バーと買い物が
    // 16:48 で切られていたのに、バーを確定すると買い物が 16:12-17:12 に戻り、
    // 確定したバーと重なった。
    const blocks = fixed.filter((f) => f.tz === group[0].tz);
    for (const it of merged) {
      for (const b of blocks) {
        // 同じ場所なら触らない（確定した予定に下書きを吸収させる手段が無い）。
        if (b.placeKey !== null && b.placeKey === placeKey(it)) continue;
        const s = startMin(it);
        const e = endMin(it);
        const bs = blockMin(b.startAt);
        const be = blockMin(b.endAt);
        if (e === null || s >= be || e <= bs) continue;
        if (s < bs) {
          // 前にはみ出している → 終わりを確定の開始まで詰める。
          const at = fromMin(bs);
          it.prefill.endDate = at.date === it.date ? null : at.date;
          it.prefill.endTime = at.time;
        } else if (be < e) {
          // 中から始まっている → 始まりを確定の終わりまで下げる。
          const at = fromMin(be);
          it.date = at.date;
          it.time = at.time;
          it.labelParts = [it.labelParts[0] ?? "", formatWhen(at.date, at.time)];
        }
        // 丸ごと覆われている（動かすと消える）ときは触らない。
      }
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
