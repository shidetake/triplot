import { describe, expect, it } from "vitest";

import {
  addDays,
  buildSchedule,
  buildTripTzTimeline,
  formatDayLabel,
  formatMinutes,
  parseWall,
  resolveEventTz,
  resolveExpenseTz,
  type ScheduleEvent,
} from "./schedule";

describe("formatMinutes: 通算分 → HH:MM", () => {
  it("既定は時もゼロ埋めした 24h 表記（アプリ標準）", () => {
    expect(formatMinutes(0)).toBe("00:00");
    expect(formatMinutes(9 * 60)).toBe("09:00");
    expect(formatMinutes(9 * 60 + 5)).toBe("09:05");
    expect(formatMinutes(23 * 60 + 59)).toBe("23:59");
  });

  it("padHour=false は時のゼロ埋めを落とす（週カレンダー軸の例外）", () => {
    expect(formatMinutes(9 * 60, false)).toBe("9:00");
    expect(formatMinutes(9 * 60 + 5, false)).toBe("9:05");
    expect(formatMinutes(0, false)).toBe("0:00");
    // 分は常にゼロ埋め、2桁の時は変わらない
    expect(formatMinutes(13 * 60 + 7, false)).toBe("13:07");
  });
});

function ev(p: Partial<ScheduleEvent> & Pick<ScheduleEvent, "id">): ScheduleEvent {
  return {
    title: p.id,
    kind: "normal",
    allDay: false,
    startAt: "2026-05-01T09:00:00",
    endAt: null,
    startTz: "Asia/Tokyo",
    endTz: null,
    tzDisambigTransitId: null,
    tzDisambigSide: null,
    placeId: null,
    visibility: "shared",
    note: null,
    needsReservation: false,
    reservationDone: false,
    participantMemberIds: [],
    ...p,
  };
}

describe("resolveExpenseTz: 旅程からTZを引く", () => {
  // 成田(JST)→ホノルル(HST)。時差>飛行時間で到着暦日が出発と同じ(5/22)。
  // 復路は逆で 5/28 発(HST) → 5/30 着(JST)、5/29 は空の上。
  const events: ScheduleEvent[] = [
    ev({
      id: "out",
      kind: "transit",
      startAt: "2026-05-22T20:00:00",
      startTz: "Asia/Tokyo",
      endAt: "2026-05-22T09:00:00",
      endTz: "Pacific/Honolulu",
    }),
    ev({
      id: "ret",
      kind: "transit",
      startAt: "2026-05-28T11:00:00",
      startTz: "Pacific/Honolulu",
      endAt: "2026-05-30T15:00:00",
      endTz: "Asia/Tokyo",
    }),
  ];
  const tl = buildTripTzTimeline(events);

  it("出発前は出発TZ(JST)", () => {
    expect(resolveExpenseTz("2026-05-21", tl)).toEqual({
      kind: "single",
      tz: "Asia/Tokyo",
    });
  });
  it("往路の乗継日(出発日==到着日)は ambiguous", () => {
    expect(resolveExpenseTz("2026-05-22", tl)).toEqual({
      kind: "ambiguous",
      options: [
        { tz: "Asia/Tokyo", transitId: "out", side: "depart" },
        { tz: "Pacific/Honolulu", transitId: "out", side: "arrive" },
      ],
    });
  });
  it("滞在中は到着TZ(HST)", () => {
    expect(resolveExpenseTz("2026-05-25", tl)).toEqual({
      kind: "single",
      tz: "Pacific/Honolulu",
    });
  });
  it("復路の出発日は出発TZ(HST)", () => {
    expect(resolveExpenseTz("2026-05-28", tl)).toEqual({
      kind: "single",
      tz: "Pacific/Honolulu",
    });
  });
  it("復路で空の上の暦日は到着側(JST)に寄せる", () => {
    expect(resolveExpenseTz("2026-05-29", tl)).toEqual({
      kind: "single",
      tz: "Asia/Tokyo",
    });
  });
  it("復路の到着日(JST)と帰国後", () => {
    expect(resolveExpenseTz("2026-05-30", tl)).toEqual({
      kind: "single",
      tz: "Asia/Tokyo",
    });
    expect(resolveExpenseTz("2026-06-01", tl)).toEqual({
      kind: "single",
      tz: "Asia/Tokyo",
    });
  });
  it("transit が無ければ常に fallback（最初の非終日イベントのTZ）", () => {
    const tl2 = buildTripTzTimeline([
      ev({ id: "a", startTz: "Europe/Paris" }),
    ]);
    expect(resolveExpenseTz("2026-05-22", tl2)).toEqual({
      kind: "single",
      tz: "Europe/Paris",
    });
  });

  it("fallback は配列の並び順ではなく実際に一番早いイベントのTZ", () => {
    // ホノルル08:00(HST)=UTC 18:00 5/1、東京08:00(JST)=UTC 23:00 4/30。
    // 配列ではホノルルが先だが、絶対時刻では東京の方が早い。
    const tl3 = buildTripTzTimeline([
      ev({
        id: "honolulu",
        startAt: "2026-05-01T08:00:00",
        startTz: "Pacific/Honolulu",
      }),
      ev({
        id: "tokyo",
        startAt: "2026-05-01T08:00:00",
        startTz: "Asia/Tokyo",
      }),
    ]);
    expect(resolveExpenseTz("2026-05-22", tl3)).toEqual({
      kind: "single",
      tz: "Asia/Tokyo",
    });
  });

  it("壁時計の文字列としては後ろの便が実際には先発でも、絶対時刻順に並ぶ", () => {
    // 実データで見つかった例: 日本(JST)発 20:00 → ハワイ(HST)着（同日）、
    // ハワイ(HST)発 15:30 → 太平洋時間(PST)着（同日）。壁時計の文字列だけ見ると
    // 15:30 < 20:00 でハワイ発が先に見えるが、TZが違うので実際は JST 20:00 の方が
    // 絶対時刻では先（JST 20:00 = UTC 11:00、HST 15:30 = 翌UTC 01:30）。
    // 登録順に関わらず、実際の訪問順(日本→ハワイ→太平洋時間)で候補が並ぶこと。
    const tl5 = buildTripTzTimeline([
      ev({
        id: "leg-hnl-lax",
        kind: "transit",
        startAt: "2026-06-19T15:30:00",
        startTz: "Pacific/Honolulu",
        endAt: "2026-06-19T21:30:00",
        endTz: "America/Los_Angeles",
      }),
      ev({
        id: "leg-nrt-hnl",
        kind: "transit",
        startAt: "2026-06-19T20:00:00",
        startTz: "Asia/Tokyo",
        endAt: "2026-06-19T10:00:00",
        endTz: "Pacific/Honolulu",
      }),
    ]);
    expect(resolveExpenseTz("2026-06-19", tl5)).toEqual({
      kind: "ambiguous",
      options: [
        { tz: "Asia/Tokyo", transitId: "leg-nrt-hnl", side: "depart" },
        { tz: "Pacific/Honolulu", transitId: "leg-nrt-hnl", side: "arrive" },
        { tz: "America/Los_Angeles", transitId: "leg-hnl-lax", side: "arrive" },
      ],
    });
  });

  it("同日に2回乗り継ぐ(3TZ跨ぎ)は3件とも ambiguous の候補に出る", () => {
    // 成田(JST)→ソウル(KST)→シンガポール(SGT)、いずれも同一暦日に完結する乗継。
    const tl3 = buildTripTzTimeline([
      ev({
        id: "leg1",
        kind: "transit",
        startAt: "2026-05-22T07:00:00",
        startTz: "Asia/Tokyo",
        endAt: "2026-05-22T09:30:00",
        endTz: "Asia/Seoul",
      }),
      ev({
        id: "leg2",
        kind: "transit",
        startAt: "2026-05-22T11:00:00",
        startTz: "Asia/Seoul",
        endAt: "2026-05-22T16:00:00",
        endTz: "Asia/Singapore",
      }),
    ]);
    expect(resolveExpenseTz("2026-05-22", tl3)).toEqual({
      kind: "ambiguous",
      options: [
        { tz: "Asia/Tokyo", transitId: "leg1", side: "depart" },
        { tz: "Asia/Seoul", transitId: "leg1", side: "arrive" },
        { tz: "Asia/Singapore", transitId: "leg2", side: "arrive" },
      ],
    });
  });

  it("日をまたぐ移動の到着日にさらに同日で乗り継ぐ場合も候補に出る", () => {
    // 前日発・当日着(ソウル)の後、同日中にシンガポール行きに乗り継ぐ。
    const tl4 = buildTripTzTimeline([
      ev({
        id: "leg1",
        kind: "transit",
        startAt: "2026-05-21T23:00:00",
        startTz: "Asia/Tokyo",
        endAt: "2026-05-22T02:00:00",
        endTz: "Asia/Seoul",
      }),
      ev({
        id: "leg2",
        kind: "transit",
        startAt: "2026-05-22T11:00:00",
        startTz: "Asia/Seoul",
        endAt: "2026-05-22T16:00:00",
        endTz: "Asia/Singapore",
      }),
    ]);
    expect(resolveExpenseTz("2026-05-22", tl4)).toEqual({
      kind: "ambiguous",
      options: [
        { tz: "Asia/Seoul", transitId: "leg1", side: "arrive" },
        { tz: "Asia/Singapore", transitId: "leg2", side: "arrive" },
      ],
    });
  });
});

describe("resolveEventTz: 通常予定/費用の実際のTZ解決", () => {
  const tl = buildTripTzTimeline([
    ev({
      id: "out",
      kind: "transit",
      startAt: "2026-05-22T20:00:00",
      startTz: "Asia/Tokyo",
      endAt: "2026-05-22T09:00:00",
      endTz: "Pacific/Honolulu",
    }),
  ]);

  it("非曖昧な日は disambig を無視して自動導出", () => {
    expect(resolveEventTz("2026-05-25", null, null, tl)).toBe(
      "Pacific/Honolulu",
    );
  });

  it("乗継日は保存済みの選択(transitId+side)を使う", () => {
    expect(resolveEventTz("2026-05-22", "out", "arrive", tl)).toBe(
      "Pacific/Honolulu",
    );
    expect(resolveEventTz("2026-05-22", "out", "depart", tl)).toBe(
      "Asia/Tokyo",
    );
  });

  it("選択が未保存(null)なら先頭候補(出発側)にフォールバック", () => {
    expect(resolveEventTz("2026-05-22", null, null, tl)).toBe("Asia/Tokyo");
  });

  it("選択先の乗継が旅程から消えていても先頭候補にフォールバック", () => {
    expect(resolveEventTz("2026-05-22", "deleted-transit", "arrive", tl)).toBe(
      "Asia/Tokyo",
    );
  });
});

describe("壁時計・日付ユーティリティ", () => {
  it("parseWall は日付と分を取り出す（Date解釈しない）", () => {
    expect(parseWall("2026-05-01T19:10:00")).toEqual({
      date: "2026-05-01",
      minutes: 19 * 60 + 10,
    });
    expect(parseWall("2026-05-01")).toEqual({ date: "2026-05-01", minutes: 0 });
  });

  it("addDays は月跨ぎも正しい", () => {
    expect(addDays("2026-04-27", 5)).toBe("2026-05-02");
    expect(addDays("2026-05-01", -1)).toBe("2026-04-30");
  });

  it("formatDayLabel は M/D(曜)", () => {
    expect(formatDayLabel("2026-04-27")).toBe("4/27(月)");
  });
});

describe("buildSchedule: 列の構築", () => {
  it("イベントも trip 日付も無ければ空", () => {
    const s = buildSchedule([], {});
    expect(s.groups).toEqual([]);
    expect(s.columns).toEqual([]);
  });

  it("1泊2日は2列（無駄な7列を出さない）", () => {
    const s = buildSchedule([], {
      tripStart: "2026-04-27",
      tripEnd: "2026-04-28",
    });
    expect(s.columns.map((c) => c.date)).toEqual([
      "2026-04-27",
      "2026-04-28",
    ]);
  });

  it("8日旅行は8列", () => {
    const s = buildSchedule([], {
      tripStart: "2026-05-01",
      tripEnd: "2026-05-08",
    });
    expect(s.columns).toHaveLength(8);
  });

  it("イベントが trip 範囲外でも列が出る", () => {
    const s = buildSchedule(
      [ev({ id: "e1", startAt: "2026-05-10T09:00:00" })],
      { tripStart: "2026-05-01", tripEnd: "2026-05-02" },
    );
    expect(s.columns.map((c) => c.date)).toContain("2026-05-10");
  });

  it("時差移動が無い普通の日のTZは最初の非終日イベント由来", () => {
    const s = buildSchedule(
      [ev({ id: "e1", startTz: "Pacific/Honolulu" })],
      { tripStart: "2026-05-01", tripEnd: "2026-05-01" },
    );
    expect(s.columns[0].tz).toBe("Pacific/Honolulu");
  });

  it("「最初の非終日イベント」は配列の並び順ではなく実際に一番早いイベント", () => {
    // ホノルル08:00(HST)=UTC 18:00 5/1、東京08:00(JST)=UTC 23:00 4/30。
    // 配列ではホノルルが先だが、絶対時刻では東京の方が早い。
    const s = buildSchedule(
      [
        ev({
          id: "honolulu",
          startAt: "2026-05-01T08:00:00",
          startTz: "Pacific/Honolulu",
        }),
        ev({
          id: "tokyo",
          startAt: "2026-05-01T08:00:00",
          startTz: "Asia/Tokyo",
        }),
      ],
      { tripStart: "2026-05-01", tripEnd: "2026-05-01" },
    );
    expect(s.columns[0].tz).toBe("Asia/Tokyo");
  });
});

describe("buildSchedule: 時差移動の日は等幅2列", () => {
  const flight = ev({
    id: "f1",
    title: "NRT-HNL",
    kind: "transit",
    startAt: "2026-04-27T19:10:00",
    startTz: "Asia/Tokyo",
    endAt: "2026-04-27T08:30:00", // 日付変更線で同じ日付の朝に着く
    endTz: "Pacific/Honolulu",
  });

  it("移動日が出発TZ側/到着TZ側の2列グループになる", () => {
    const s = buildSchedule([flight], {
      tripStart: "2026-04-27",
      tripEnd: "2026-04-28",
    });
    const tgroup = s.groups.find((g) => g.key === "t-f1");
    expect(tgroup).toBeDefined();
    expect(tgroup!.columns).toHaveLength(2);
    expect(tgroup!.columns[0]).toMatchObject({
      role: "transit-depart",
      tz: "Asia/Tokyo",
      date: "2026-04-27",
    });
    expect(tgroup!.columns[1]).toMatchObject({
      role: "transit-arrive",
      tz: "Pacific/Honolulu",
      date: "2026-04-27",
    });
  });

  it("移動後はTZが到着側に切り替わる", () => {
    const s = buildSchedule([flight], {
      tripStart: "2026-04-27",
      tripEnd: "2026-04-29",
    });
    const after = s.columns.find(
      (c) => c.date === "2026-04-28" && c.role === "day",
    );
    expect(after?.tz).toBe("Pacific/Honolulu");
  });

  it("リボン用に出発列・到着列・分を持つ", () => {
    const s = buildSchedule([flight], {
      tripStart: "2026-04-27",
      tripEnd: "2026-04-28",
    });
    expect(s.transits).toHaveLength(1);
    expect(s.transits[0]).toMatchObject({
      departColumnKey: "t-f1-dep",
      departMin: 19 * 60 + 10,
      arriveColumnKey: "t-f1-arr",
      arriveMin: 8 * 60 + 30,
    });
  });

  it("復路で空中を跨いだ暦日は列を作らない（消えた日を正直に表現）", () => {
    const ret = ev({
      id: "r1",
      title: "HNL-NRT",
      kind: "transit",
      startAt: "2026-05-03T23:00:00",
      startTz: "Pacific/Honolulu",
      endAt: "2026-05-05T05:00:00", // 5/4 は空中で消える
      endTz: "Asia/Tokyo",
    });
    const s = buildSchedule([ret], {
      tripStart: "2026-05-01",
      tripEnd: "2026-05-05",
    });
    const dates = s.columns.map((c) => c.date);
    expect(dates).toContain("2026-05-03");
    expect(dates).toContain("2026-05-05");
    expect(dates).not.toContain("2026-05-04");
  });

  it("時刻が前進する便（時差が戻らない）は日付を結合せず普通の列にする", () => {
    // HNL(HST)→HND(JST)。出発 5/4 16:20 → 到着 5/5 20:00。
    // 壁時計上は前進（重なり無し）なので2列グループにしない。
    const fwd = ev({
      id: "fwd1",
      title: "HNL-HND",
      kind: "transit",
      startAt: "2026-05-04T16:20:00",
      startTz: "Pacific/Honolulu",
      endAt: "2026-05-05T20:00:00",
      endTz: "Asia/Tokyo",
    });
    const s = buildSchedule([fwd], {
      tripStart: "2026-05-04",
      tripEnd: "2026-05-05",
    });
    // 移動日の2列グループ(t-fwd1)は作られない
    expect(s.groups.find((g) => g.key === "t-fwd1")).toBeUndefined();
    // 出発日・到着日は普通の日付列（role=day）として並ぶ
    const dep = s.columns.find((c) => c.date === "2026-05-04");
    const arr = s.columns.find((c) => c.date === "2026-05-05");
    expect(dep).toMatchObject({ role: "day", tz: "Pacific/Honolulu" });
    expect(arr).toMatchObject({ role: "day", tz: "Asia/Tokyo" });
    // 出発日には wraps 便と対称な TZ 変化注記を出す。注記は2列ぶんの幅で見せる。
    const depGroup = s.groups.find((g) => g.key === "d-2026-05-04");
    expect(depGroup?.tzNote).toBe("Pacific/Honolulu → Asia/Tokyo");
    expect(depGroup?.tzNoteSpan).toBe(2);
    // 便自体は出発列→到着列を跨ぐリボンとして残る
    expect(s.transits).toHaveLength(1);
    expect(s.transits[0]).toMatchObject({
      departColumnKey: dep!.key,
      arriveColumnKey: arr!.key,
      departMin: 16 * 60 + 20,
      arriveMin: 20 * 60,
    });
  });
});

describe("buildSchedule: 同日に連続で乗り継ぐ場合", () => {
  it("wraps便の到着列を、直後にforward便が出発するときは新規列にせず使い回す", () => {
    // 実データで見つかった例: 東京(JST)20:00発→ホノルル(HST)10:00着（同日・巻き戻り）、
    // 続けてホノルル(HST)15:30発→太平洋時間(LA)21:30着（同日・前進）。
    // 2便目の出発は1便目の到着列(ホノルル)とちょうど同じ(日付,TZ)なので、
    // 新しい列を作らず使い回い、その日は2列のまま(3列に増えない)。
    const nrt = ev({
      id: "nrt",
      title: "NRT",
      kind: "transit",
      startAt: "2026-06-19T20:00:00",
      startTz: "Asia/Tokyo",
      endAt: "2026-06-19T10:00:00",
      endTz: "Pacific/Honolulu",
    });
    const kakaka = ev({
      id: "kakaka",
      title: "かかか",
      kind: "transit",
      startAt: "2026-06-19T15:30:00",
      startTz: "Pacific/Honolulu",
      endAt: "2026-06-19T21:30:00",
      endTz: "America/Los_Angeles",
    });
    const s = buildSchedule([kakaka, nrt], {
      tripStart: "2026-06-19",
      tripEnd: "2026-06-20",
    });

    // 6/19 は東京・ホノルルの2列のみ（かかか便による重複3列目が出ない）
    const day619 = s.columns.filter((c) => c.date === "2026-06-19");
    expect(day619).toHaveLength(2);
    expect(day619.map((c) => c.tz)).toEqual(["Asia/Tokyo", "Pacific/Honolulu"]);

    const honoluluCol = day619.find((c) => c.tz === "Pacific/Honolulu")!;
    const kakakaPlaced = s.transits.find((t) => t.event.id === "kakaka");
    // かかか便は出発・到着とも既存のホノルル列を使い回す（新規のLA列は作らない）
    expect(kakakaPlaced).toMatchObject({
      departColumnKey: honoluluCol.key,
      arriveColumnKey: honoluluCol.key,
      departMin: 15 * 60 + 30,
      arriveMin: 21 * 60 + 30,
    });
  });
});

describe("buildSchedule: 通常予定は startTz が無くても旅程+disambig から列配置される", () => {
  const flight = ev({
    id: "f1",
    kind: "transit",
    startAt: "2026-04-27T19:10:00",
    startTz: "Asia/Tokyo",
    endAt: "2026-04-27T08:30:00",
    endTz: "Pacific/Honolulu",
  });

  it("非曖昧な日は startTz=null でも旅程から自動導出した列に置かれる", () => {
    const normal = ev({
      id: "n1",
      startAt: "2026-04-29T09:00:00",
      startTz: null,
      tzDisambigTransitId: null,
      tzDisambigSide: null,
    });
    const s = buildSchedule([flight, normal], {
      tripStart: "2026-04-27",
      tripEnd: "2026-04-29",
    });
    const placed = s.timed.find((t) => t.event.id === "n1")!;
    const col = s.columns.find((c) => c.key === placed.columnKey)!;
    expect(col.tz).toBe("Pacific/Honolulu");
  });

  it("乗継日は保存済みの tzDisambig* に従って出発側/到着側の列に置かれる", () => {
    const departSide = ev({
      id: "n-dep",
      startAt: "2026-04-27T10:00:00",
      startTz: null,
      tzDisambigTransitId: "f1",
      tzDisambigSide: "depart",
    });
    const arriveSide = ev({
      id: "n-arr",
      startAt: "2026-04-27T10:00:00",
      startTz: null,
      tzDisambigTransitId: "f1",
      tzDisambigSide: "arrive",
    });
    const s = buildSchedule([flight, departSide, arriveSide], {
      tripStart: "2026-04-27",
      tripEnd: "2026-04-27",
    });
    const depPlaced = s.timed.find((t) => t.event.id === "n-dep")!;
    const arrPlaced = s.timed.find((t) => t.event.id === "n-arr")!;
    const depCol = s.columns.find((c) => c.key === depPlaced.columnKey)!;
    const arrCol = s.columns.find((c) => c.key === arrPlaced.columnKey)!;
    expect(depCol.tz).toBe("Asia/Tokyo");
    expect(arrCol.tz).toBe("Pacific/Honolulu");
  });
});

describe("buildSchedule: 時刻イベントの重なりレーン", () => {
  it("重ならなければ1レーン", () => {
    const s = buildSchedule(
      [
        ev({ id: "a", startAt: "2026-05-01T09:00:00", endAt: "2026-05-01T10:00:00" }),
        ev({ id: "b", startAt: "2026-05-01T11:00:00", endAt: "2026-05-01T12:00:00" }),
      ],
      { tripStart: "2026-05-01", tripEnd: "2026-05-01" },
    );
    expect(s.timed.every((t) => t.laneCount === 1)).toBe(true);
  });

  it("重なると横並びレーンに分かれる", () => {
    const s = buildSchedule(
      [
        ev({ id: "a", startAt: "2026-05-01T09:00:00", endAt: "2026-05-01T11:00:00" }),
        ev({ id: "b", startAt: "2026-05-01T10:00:00", endAt: "2026-05-01T12:00:00" }),
      ],
      { tripStart: "2026-05-01", tripEnd: "2026-05-01" },
    );
    const a = s.timed.find((t) => t.event.id === "a")!;
    const b = s.timed.find((t) => t.event.id === "b")!;
    expect(a.laneCount).toBe(2);
    expect(b.laneCount).toBe(2);
    expect(new Set([a.lane, b.lane])).toEqual(new Set([0, 1]));
  });

  it("end 無しは既定60分扱い", () => {
    const s = buildSchedule(
      [ev({ id: "a", startAt: "2026-05-01T09:00:00", endAt: null })],
      { tripStart: "2026-05-01", tripEnd: "2026-05-01" },
    );
    expect(s.timed[0].endMin).toBe(10 * 60);
  });

  it("時差移動(同一列で完結)と通常予定が重なると両方レーンを分け合う", () => {
    // ホノルル15:30発→太平洋時間21:30着（同日forward、1列で完結）に、
    // 通常予定(16:00-17:00)を重ねる。全幅で隠れず両方2レーンになる。
    const s = buildSchedule(
      [
        ev({
          id: "flight",
          kind: "transit",
          startAt: "2026-06-19T15:30:00",
          startTz: "Pacific/Honolulu",
          endAt: "2026-06-19T21:30:00",
          endTz: "America/Los_Angeles",
        }),
        ev({
          id: "normal",
          startAt: "2026-06-19T16:00:00",
          startTz: "Pacific/Honolulu",
          endAt: "2026-06-19T17:00:00",
        }),
      ],
      { tripStart: "2026-06-19", tripEnd: "2026-06-19" },
    );
    const t = s.transits.find((x) => x.event.id === "flight")!;
    const n = s.timed.find((x) => x.event.id === "normal")!;
    expect(t.departLaneCount).toBe(2);
    expect(n.laneCount).toBe(2);
    expect(new Set([t.departLane, n.lane])).toEqual(new Set([0, 1]));
  });

  it("時差移動(出発/到着別列)の出発側ブロックと通常予定が重なるとレーンを分け合う", () => {
    // 東京20:00発→ホノルル10:00着（wraps、2列）。出発側ブロックは
    // 20:00〜24:00 に描かれるので、同じ列の21:00の通常予定と重なる。
    const s = buildSchedule(
      [
        ev({
          id: "flight",
          kind: "transit",
          startAt: "2026-06-19T20:00:00",
          startTz: "Asia/Tokyo",
          endAt: "2026-06-19T10:00:00",
          endTz: "Pacific/Honolulu",
        }),
        ev({
          id: "normal",
          startAt: "2026-06-19T21:00:00",
          startTz: "Asia/Tokyo",
          endAt: "2026-06-19T22:00:00",
        }),
      ],
      { tripStart: "2026-06-19", tripEnd: "2026-06-19" },
    );
    const t = s.transits.find((x) => x.event.id === "flight")!;
    const n = s.timed.find((x) => x.event.id === "normal")!;
    expect(t.departLaneCount).toBe(2);
    expect(n.laneCount).toBe(2);
    expect(new Set([t.departLane, n.lane])).toEqual(new Set([0, 1]));
    // 到着側ブロック(0:00-10:00)は別列で誰とも重ならないので1レーンのまま
    expect(t.arriveLaneCount).toBe(1);
  });
});

describe("buildSchedule: 日跨ぎ通常イベント（TZは跨がない）", () => {
  it("初日[開始,24:00]・最終日[0:00,終了]に分割される", () => {
    const s = buildSchedule(
      [
        ev({
          id: "night",
          startAt: "2026-05-01T22:00:00",
          endAt: "2026-05-02T02:00:00",
        }),
      ],
      { tripStart: "2026-05-01", tripEnd: "2026-05-02" },
    );
    const segs = s.timed.filter((t) => t.event.id === "night");
    expect(segs).toHaveLength(2);
    const day1 = segs.find((x) => x.columnKey === "d-2026-05-01")!;
    const day2 = segs.find((x) => x.columnKey === "d-2026-05-02")!;
    expect(day1).toMatchObject({ topMin: 22 * 60, endMin: 24 * 60 });
    expect(day2).toMatchObject({ topMin: 0, endMin: 2 * 60 });
  });

  it("最終日0:00ちょうど終了なら最終日セグメントは出さない", () => {
    const s = buildSchedule(
      [
        ev({
          id: "x",
          startAt: "2026-05-01T10:00:00",
          endAt: "2026-05-02T00:00:00",
        }),
      ],
      { tripStart: "2026-05-01", tripEnd: "2026-05-02" },
    );
    const segs = s.timed.filter((t) => t.event.id === "x");
    expect(segs).toHaveLength(1);
    expect(segs[0]).toMatchObject({
      columnKey: "d-2026-05-01",
      topMin: 10 * 60,
      endMin: 24 * 60,
    });
  });
});

describe("buildSchedule: 終日・連日バー", () => {
  it("連日バーが正しい列index範囲を持ち、重なりは別行へ", () => {
    const s = buildSchedule(
      [
        ev({
          id: "stay",
          title: "宿泊",
          allDay: true,
          startTz: "UTC",
          startAt: "2026-05-02T00:00:00",
          endAt: "2026-05-04T00:00:00",
        }),
        ev({
          id: "x",
          title: "イベント",
          allDay: true,
          startTz: "UTC",
          startAt: "2026-05-03T00:00:00",
          endAt: "2026-05-03T00:00:00",
        }),
      ],
      { tripStart: "2026-05-01", tripEnd: "2026-05-05" },
    );
    // columns: 05-01..05-05 = index 0..4
    const stay = s.allDayBars.find((b) => b.event.id === "stay")!;
    expect(stay.startColIndex).toBe(1);
    expect(stay.endColIndex).toBe(3);
    expect(stay.row).toBe(0);
    const x = s.allDayBars.find((b) => b.event.id === "x")!;
    expect(x.row).toBe(1); // 宿泊と重なるので別行
    expect(s.allDayRowCount).toBe(2);
  });
});

describe("buildSchedule: 縦軸は常に0:00-24:00固定", () => {
  it("予定があっても窓は伸縮しない", () => {
    const s = buildSchedule(
      [
        ev({ id: "a", startAt: "2026-05-01T09:00:00", endAt: "2026-05-01T10:00:00" }),
        ev({ id: "b", startAt: "2026-05-01T14:00:00", endAt: "2026-05-01T15:30:00" }),
      ],
      { tripStart: "2026-05-01", tripEnd: "2026-05-01" },
    );
    expect(s.window).toEqual({ startMin: 0, endMin: 24 * 60 });
  });

  it("予定が無くても 0:00-24:00", () => {
    const s = buildSchedule([], {
      tripStart: "2026-05-01",
      tripEnd: "2026-05-01",
    });
    expect(s.window).toEqual({ startMin: 0, endMin: 24 * 60 });
  });
});
