import {
  buildTripTzTimeline,
  narrowTzByTime,
  resolveExpenseTz,
  timelineFor,
  wallClockToUtcMs,
  type ScheduleEvent,
  type TripTzTimeline,
} from "./schedule";

// 年表は人ごと（schedule.ts の timelineFor）。移動の参加者を付け忘れると、
// その人の年表が**静かに**別の土地に飛ぶ（誰も気付かないまま、その人の予定や
// 費用の TZ がずれる）。ここは付け忘れの「兆候」を構造から拾って知らせる。
//
// 判定は2つ。強い順に:
//
// 1. **年表が繋がっていない** — ある人の連続する移動で、前の到着地の時間帯と
//    次の出発地の時間帯が違う。純粋に構造の話で誤検出が無い。付け忘れはほぼ
//    これに落ちる（合流をまたぐ移動を「全員」のままにすると、まだ合流して
//    いない人の年表にも入ってここで捕まる）。
// 2. **同じ予定に、その時刻に違う時間帯にいる人が入っている** — 「この夕食は
//    3人だが、A さんはこの時ペルーにいる」。1 では捕まらない「全員参加のままに
//    した予定」がここで出る。
//
// **知らせるだけで止めない。** 意図的にそうしている場合もあるので、判断は
// ユーザーに残す。**保存もしない**（直した後も警告が残る／直っていないのに
// 消えるを避ける）＝毎回ここで計算する。
//
// 「同じ TZ ≠ 同じ場所」（ホノルルとタヒチは同じ UTC−10）なので、これは
// 「合流した」の判定には使えない。時間帯が食い違う＝別の土地、の向きだけが
// 確実で、その向きだけを使う。

export type TzGroup = { tz: string; memberIds: string[] };

export type TimelineIssue =
  | {
      kind: "disconnected";
      memberId: string;
      prev: { id: string; title: string; arriveTz: string };
      next: { id: string; title: string; departTz: string };
    }
  | { kind: "split"; eventId: string; title: string; groups: TzGroup[] };

/** 年表の1本の中で、隣り合う移動が繋がっていない箇所。 */
function walkDisconnections(
  tl: TripTzTimeline,
  memberIds: readonly string[],
): { memberId: string; prevId: string; nextId: string }[] {
  const out: { memberId: string; prevId: string; nextId: string }[] = [];
  for (const memberId of memberIds) {
    const { transits } = timelineFor(tl, [memberId]);
    for (let i = 1; i < transits.length; i++) {
      const prev = transits[i - 1];
      const next = transits[i];
      if (prev.arriveTz !== next.departTz) {
        out.push({ memberId, prevId: prev.transitId, nextId: next.transitId });
      }
    }
  }
  return out;
}

/**
 * 判定1。人ごとの年表で、前の到着地と次の出発地の時間帯が違う箇所。
 * `memberIds` は旅行のアクティブメンバー（全員参加の移動は全員の年表に入る）。
 */
export function disconnectedTimelines(
  events: ScheduleEvent[],
  memberIds: readonly string[],
  defaultTimezone: string | null | undefined,
): Extract<TimelineIssue, { kind: "disconnected" }>[] {
  const tl = buildTripTzTimeline(events, defaultTimezone);
  const byId = new Map(events.map((e) => [e.id, e]));
  const transitById = new Map(tl.transits.map((t) => [t.transitId, t]));
  return walkDisconnections(tl, memberIds).map((d) => ({
    kind: "disconnected",
    memberId: d.memberId,
    prev: {
      id: d.prevId,
      title: byId.get(d.prevId)?.title ?? "",
      arriveTz: transitById.get(d.prevId)!.arriveTz,
    },
    next: {
      id: d.nextId,
      title: byId.get(d.nextId)?.title ?? "",
      departTz: transitById.get(d.nextId)!.departTz,
    },
  }));
}

/**
 * フォームで組み立て中の移動（まだ保存していない・編集中）が、乗る人の年表を
 * 断ち切るかどうか。年表に同じ id があれば差し替え、無ければ足して判定する。
 * 返るのは「この移動の前が繋がっていない人」と「後が繋がっていない人」。
 * 時差の無い移動は年表に入らないので常に空。
 */
export function transitConnectionIssues(
  tl: TripTzTimeline,
  transit: {
    transitId: string;
    departAt: string; // 壁時計 "YYYY-MM-DDTHH:MM"
    arriveAt: string;
    departTz: string;
    arriveTz: string;
    participantsEveryone: boolean;
    participantMemberIds: string[];
  },
  memberIds: readonly string[],
): { memberId: string; side: "before" | "after"; tz: string }[] {
  if (transit.departTz === transit.arriveTz) return [];
  const entry: TripTzTimeline["transits"][number] = {
    transitId: transit.transitId,
    departDate: transit.departAt.slice(0, 10),
    arriveDate: transit.arriveAt.slice(0, 10),
    departTz: transit.departTz,
    arriveTz: transit.arriveTz,
    departTime: transit.departAt.slice(11, 16),
    arriveTime: transit.arriveAt.slice(11, 16),
    participantsEveryone: transit.participantsEveryone,
    participantMemberIds: transit.participantMemberIds,
  };
  const instant = (t: TripTzTimeline["transits"][number]) =>
    wallClockToUtcMs(`${t.departDate}T${t.departTime}`, t.departTz);
  const transits = [
    ...tl.transits.filter((t) => t.transitId !== transit.transitId),
    entry,
  ].sort((a, b) => instant(a) - instant(b));
  const riders = transit.participantsEveryone
    ? memberIds
    : transit.participantMemberIds;
  const out: { memberId: string; side: "before" | "after"; tz: string }[] = [];
  for (const d of walkDisconnections(
    { fallbackTz: tl.fallbackTz, transits },
    riders,
  )) {
    if (d.nextId === transit.transitId) {
      out.push({
        memberId: d.memberId,
        side: "before",
        tz: transits.find((t) => t.transitId === d.prevId)!.arriveTz,
      });
    } else if (d.prevId === transit.transitId) {
      out.push({
        memberId: d.memberId,
        side: "after",
        tz: transits.find((t) => t.transitId === d.nextId)!.departTz,
      });
    }
  }
  return out;
}

/**
 * その日時に、それぞれの人がどの時間帯にいるかを時間帯ごとにまとめる。
 * 移動日で決められない人（時刻が無い・時刻で絞っても2つ残る）は入れない
 * ＝分からないものを「食い違い」に数えない。
 *
 * `disambig` は予定が持つ移動日の選択。その移動に乗った人にはその選択が効く。
 */
export function tzGroupsAt(
  tl: TripTzTimeline,
  memberIds: readonly string[],
  at: { date: string; time: string | null },
  disambig: { transitId: string; side: "depart" | "arrive" } | null,
): TzGroup[] {
  const groups: TzGroup[] = [];
  const add = (tz: string, memberId: string) => {
    const g = groups.find((x) => x.tz === tz);
    if (g) g.memberIds.push(memberId);
    else groups.push({ tz, memberIds: [memberId] });
  };
  for (const memberId of memberIds) {
    const own = timelineFor(tl, [memberId]);
    const r = resolveExpenseTz(at.date, own);
    if (r.kind === "single") {
      add(r.tz, memberId);
      continue;
    }
    const chosen = disambig
      ? r.options.find(
          (o) => o.transitId === disambig.transitId && o.side === disambig.side,
        )
      : undefined;
    if (chosen) {
      add(chosen.tz, memberId);
      continue;
    }
    const narrowed = narrowTzByTime(r.options, own, at.time);
    const tzs = new Set(narrowed.map((o) => o.tz));
    if (tzs.size === 1) add(narrowed[0].tz, memberId);
  }
  return groups;
}

/** 判定2をひとつの予定（フォームの入力途中でも）に対して行う。食い違いが無ければ null。 */
export function splitParticipants(
  tl: TripTzTimeline,
  memberIds: readonly string[],
  at: { date: string; time: string | null },
  disambig: { transitId: string; side: "depart" | "arrive" } | null,
): TzGroup[] | null {
  const groups = tzGroupsAt(tl, memberIds, at, disambig);
  return groups.length > 1 ? groups : null;
}

/**
 * 旅行全体の付け忘れの兆候（判定1＋判定2）。旅行の設定の「確認が必要 (N)」に
 * 出す。順番は 判定1（人ごと・移動順）→ 判定2（予定の並び順）。
 */
export function detectTimelineIssues(
  events: ScheduleEvent[],
  memberIds: readonly string[],
  defaultTimezone: string | null | undefined,
): TimelineIssue[] {
  const issues: TimelineIssue[] = disconnectedTimelines(
    events,
    memberIds,
    defaultTimezone,
  );
  const tl = buildTripTzTimeline(events, defaultTimezone);
  for (const e of events) {
    // 移動は判定1で見る。下書きは自分だけの仮の予定なので対象外。
    if (e.kind === "transit" || e.isDraft) continue;
    const participants = e.participantsEveryone
      ? memberIds
      : e.participantMemberIds;
    if (participants.length < 2) continue;
    const groups = splitParticipants(
      tl,
      participants,
      {
        date: e.startAt.slice(0, 10),
        time: e.allDay ? null : e.startAt.slice(11, 16),
      },
      e.tzDisambigTransitId && e.tzDisambigSide
        ? { transitId: e.tzDisambigTransitId, side: e.tzDisambigSide }
        : null,
    );
    if (groups) issues.push({ kind: "split", eventId: e.id, title: e.title, groups });
  }
  return issues;
}

/**
 * 「東京: A・B / ホノルル: C」の形。時間帯名と人名の解決は呼び出し側
 * （ロケール・メンバー一覧を知っているのはそちら）。
 */
export function formatTzGroups(
  groups: TzGroup[],
  opts: {
    tzLabel: (tz: string) => string;
    memberName: (id: string) => string;
    locale: string;
  },
): string {
  const nameSep = opts.locale.startsWith("ja") ? "・" : ", ";
  return groups
    .map(
      (g) => `${opts.tzLabel(g.tz)}: ${g.memberIds.map(opts.memberName).join(nameSep)}`,
    )
    .join(" / ");
}
