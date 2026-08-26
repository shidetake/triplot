// 旅行の候補（仮旅行）。
//
// 取り込んだメールをどの旅行にも割り当てられなかったとき、その下書きが
// 「旅行が存在する証拠」なら、旅行一覧に候補として出す。押すと旅行作成
// フォームが日程と名前を埋めた状態で開き、作れば普通の旅行になる。
//
// 仮予定・仮費用と同じ3層（真実は inbound_drafts、画面に出すのは毎回の
// 導出、確定で本物の行を作る）。ここは真ん中の導出だけを持つ純関数で、
// 新しいテーブルもカラムも要らない。違いは粒度だけで、予定・費用が
// 「下書き1行＝1項目」なのに対し、旅行は「複数メールの塊＝1件」になる。

import { addDays } from "../schedule";
import { compareTripOrder } from "../tripOrder";

import { receiptDate, type StoredEventDraft, type StoredReceipt } from "./drafts";

// 未割り当ての下書き1行（fetchUnassignedDrafts の結果の構造的部分型）。
export type ProposalDraft = {
  emailId: string;
  kind: string;
  payload: unknown;
};

export type TripProposal = {
  // この候補を構成するメール。作成時にこの全部を新しい旅行へ割り当てる。
  emailIds: string[];
  startDate: string; // "YYYY-MM-DD"
  endDate: string;
  // 場所から取った旅行名。取れなければ null（呼び出し側が日付から作る）。
  name: string | null;
  transitCount: number;
  lodgingCount: number;
};

// 同じ旅行と見なす日数の差。旅行の候補は**寄せるより分ける方に倒す**:
// 分けすぎた時は片方を作ってもう片方を割り当て直すだけで済むが、まとめ
// すぎた時は予定・費用を別の旅行へ移す手段が無い。
const GAP_DAYS = 1;

// 宿泊とみなす費用カテゴリ・旅行の存在を示す費用カテゴリ。
const LODGING_CATEGORY = "宿泊";
const TRAVEL_CATEGORY = "渡航";

type EmailInfo = {
  emailId: string;
  start: string;
  end: string;
  transit: number;
  lodging: number;
  // 旅行名の手がかり。宿泊由来を優先したいので重みを持つ。
  hints: { locality: string | null; region: string | null; weight: number }[];
};

function dayDiff(a: string, b: string): number {
  return Math.round(
    (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000,
  );
}

// 2つの期間の隙間（日）。重なっていれば 0。
function gapDays(a: EmailInfo, b: EmailInfo): number {
  return Math.max(0, dayDiff(a.end, b.start), dayDiff(b.end, a.start));
}

// 1通のメールの下書きから、期間・種別・場所の手がかりをまとめる。
// 旅行の証拠にならないメール（レストランのレシート等）は null。
function emailInfo(emailId: string, drafts: ProposalDraft[]): EmailInfo | null {
  let start: string | null = null;
  let end: string | null = null;
  let transit = 0;
  let lodging = 0;
  const hints: EmailInfo["hints"] = [];
  const span = (from: string, to: string) => {
    if (!from) return;
    if (!start || from < start) start = from;
    if (!end || to > end) end = to;
  };

  for (const d of drafts) {
    if (d.kind === "expense") {
      const r = d.payload as StoredReceipt | null;
      if (!r) continue;
      const when = receiptDate(r);
      if (!when.date) continue;
      const isLodging = r.category === LODGING_CATEGORY;
      const isTravel = r.category === TRAVEL_CATEGORY;
      if (!isLodging && !isTravel) continue;
      if (isLodging) lodging += 1;
      span(when.date, when.date);
      if (r.resolvedPlace)
        hints.push({
          locality: r.resolvedPlace.locality,
          region: r.resolvedPlace.region,
          // 宿泊の場所が一番その旅行の滞在地を表す。
          weight: isLodging ? 3 : 1,
        });
      continue;
    }
    if (d.kind !== "event") continue;
    const ev = d.payload as StoredEventDraft | null;
    if (!ev?.startDate) continue;
    const isTransit = ev.kind === "transit";
    // 終日で複数日にまたがる予定は宿泊とみなす（ホテルの予約はこの形で来る）。
    const isStay = ev.kind === "allday" && !!ev.endDate && ev.endDate > ev.startDate;
    if (!isTransit && !isStay) continue;
    if (isTransit) transit += 1;
    if (isStay) lodging += 1;
    span(ev.startDate, ev.endDate ?? ev.startDate);
    // 到着地は滞在地を表すが、乗り継ぎがあると経由地を拾うので宿泊より弱く。
    const place = isStay ? ev.resolvedNamedPlace : ev.resolvedArrivalPlace;
    if (place)
      hints.push({
        locality: place.locality,
        region: place.region,
        weight: isStay ? 3 : 1,
      });
  }

  if (!start || !end) return null;
  if (transit === 0 && lodging === 0) return null;
  return { emailId, start, end, transit, lodging, hints };
}

// 重み付きの最頻値。
function topWeighted(values: { value: string | null; weight: number }[]): string | null {
  const score = new Map<string, number>();
  for (const v of values) {
    if (!v.value) continue;
    score.set(v.value, (score.get(v.value) ?? 0) + v.weight);
  }
  let best: string | null = null;
  let bestScore = 0;
  for (const [value, s] of score) {
    if (s > bestScore) {
      best = value;
      bestScore = s;
    }
  }
  return best;
}

/**
 * 未割り当ての下書きから旅行の候補を導く。
 *
 * まとまりは「期間の差が GAP_DAYS 日以内」という辺で結んだ**連結成分**。
 * そのため取り込み順に依存しない: 往路(1/1)と復路(1/3)は2日空くので最初は
 * 別々でも、後から 1/2 の宿泊が入れば両方と1日差で繋がり 1/1〜1/3 の1件に
 * なる（どの順で届いても結果は同じ）。
 */
export function deriveTripProposals(
  drafts: ProposalDraft[] | null,
): TripProposal[] {
  const byEmail = new Map<string, ProposalDraft[]>();
  for (const d of drafts ?? []) {
    const arr = byEmail.get(d.emailId) ?? [];
    arr.push(d);
    byEmail.set(d.emailId, arr);
  }

  const infos: EmailInfo[] = [];
  for (const [emailId, list] of byEmail) {
    const info = emailInfo(emailId, list);
    if (info) infos.push(info);
  }
  if (infos.length === 0) return [];

  // 連結成分（union-find ではなく素直に「変化が無くなるまで併合」。件数が
  // 小さいので十分だし、draftOverlap のマージと同じ読み方になる）。
  let groups = infos.map((i) => [i]);
  for (let changed = true; changed; ) {
    changed = false;
    outer: for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        const linked = groups[i].some((a) =>
          groups[j].some((b) => gapDays(a, b) <= GAP_DAYS),
        );
        if (!linked) continue;
        groups[i] = groups[i].concat(groups[j]);
        groups.splice(j, 1);
        changed = true;
        break outer;
      }
    }
  }

  return groups
    .map((g) => ({
      emailIds: g.map((x) => x.emailId),
      startDate: g.reduce((m, x) => (x.start < m ? x.start : m), g[0].start),
      endDate: g.reduce((m, x) => (x.end > m ? x.end : m), g[0].end),
      name:
        topWeighted(
          g.flatMap((x) => x.hints.map((h) => ({ value: h.locality, weight: h.weight }))),
        ) ??
        topWeighted(
          g.flatMap((x) => x.hints.map((h) => ({ value: h.region, weight: h.weight }))),
        ),
      transitCount: g.reduce((n, x) => n + x.transit, 0),
      lodgingCount: g.reduce((n, x) => n + x.lodging, 0),
    }))
    // 確定した旅行と同じ一覧に並ぶので同じ順（開始日の新しい順）。
    .sort((a, b) =>
      compareTripOrder(
        { start: a.startDate, title: a.name },
        { start: b.startDate, title: b.name },
      ),
    );
}

// 候補から旅行作成フォームに渡す初期値。終了日は宿泊の最終日（＝チェック
// アウト日）や復路の日付がそのまま入る。
export function tripProposalDefaults(p: TripProposal): {
  title: string | null;
  startDate: string;
  endDate: string;
} {
  return {
    title: p.name,
    startDate: p.startDate,
    // 候補が1日しか無い（片道の便だけ等）ときも、旅行として最低1泊は
    // 見込んでおく方が編集が少ない。
    endDate: p.endDate === p.startDate ? addDays(p.endDate, 1) : p.endDate,
  };
}
