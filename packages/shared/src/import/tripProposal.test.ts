import { describe, expect, it } from "vitest";

import { deriveTripProposals, tripProposalDefaults } from "./tripProposal";
import type { ProposalDraft } from "./tripProposal";

// 旅行の候補は「期間の差が1日以内」で結んだ連結成分。分けすぎは割り当て直しで
// 直せるが、まとめすぎは予定・費用を別の旅行へ移す手段が無いので直せない。
// その非対称性を前提に、寄せすぎないことをここで固定する。

const place = (locality: string | null, region: string | null = null) => ({
  placeId: "p",
  name: "n",
  formattedAddress: "a",
  lat: 0,
  lng: 0,
  region,
  locality,
  rating: null,
  userRatingCount: null,
  primaryType: null,
});

function transit(
  emailId: string,
  date: string,
  arrival?: ReturnType<typeof place>,
): ProposalDraft {
  return {
    emailId,
    kind: "event",
    payload: {
      kind: "transit",
      title: "NRT-HNL",
      startDate: date,
      startTime: "09:00",
      endDate: null,
      endTime: null,
      departTz: null,
      arriveTz: null,
      location: null,
      departLocation: null,
      vehicleNumber: null,
      referenceId: null,
      isUpdate: false,
      ...(arrival ? { resolvedArrivalPlace: arrival } : {}),
    },
  };
}

function stay(
  emailId: string,
  from: string,
  to: string,
  named?: ReturnType<typeof place>,
): ProposalDraft {
  return {
    emailId,
    kind: "event",
    payload: {
      kind: "allday",
      title: "ホテル",
      startDate: from,
      startTime: null,
      endDate: to,
      endTime: null,
      departTz: null,
      arriveTz: null,
      location: null,
      vehicleNumber: null,
      referenceId: null,
      isUpdate: false,
      ...(named ? { resolvedNamedPlace: named } : {}),
    },
  };
}

function meal(emailId: string, date: string): ProposalDraft {
  return {
    emailId,
    kind: "expense",
    payload: {
      merchant: "Cafe",
      total: 10,
      currency: "USD",
      date,
      serviceDate: null,
      time: null,
      category: "飲食",
      location: null,
      referenceId: null,
      isUpdate: false,
    },
  };
}

describe("deriveTripProposals", () => {
  it("旅行の証拠にならない下書き（食事だけ）は候補にしない", () => {
    expect(deriveTripProposals([meal("e1", "2026-01-01")])).toEqual([]);
  });

  it("2日空いた往路と復路は、まだ別の候補（寄せない）", () => {
    const out = deriveTripProposals([
      transit("e1", "2026-01-01"),
      transit("e2", "2026-01-03"),
    ]);
    expect(out.map((p) => [p.startDate, p.endDate])).toEqual([
      ["2026-01-03", "2026-01-03"],
      ["2026-01-01", "2026-01-01"],
    ]);
  });

  it("間を橋渡しする宿泊が来ると1件に繋がる（連結成分）", () => {
    const out = deriveTripProposals([
      transit("e1", "2026-01-01"),
      transit("e2", "2026-01-03"),
      stay("e3", "2026-01-02", "2026-01-03"),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].startDate).toBe("2026-01-01");
    expect(out[0].endDate).toBe("2026-01-03");
    expect(out[0].emailIds.sort()).toEqual(["e1", "e2", "e3"]);
  });

  it("取り込み順を変えても同じまとまりになる", () => {
    const items = [
      transit("e1", "2026-01-01"),
      transit("e2", "2026-01-03"),
      stay("e3", "2026-01-02", "2026-01-03"),
    ];
    const a = deriveTripProposals(items);
    const b = deriveTripProposals([items[2], items[1], items[0]]);
    expect(b.map((p) => p.emailIds.slice().sort())).toEqual(
      a.map((p) => p.emailIds.slice().sort()),
    );
  });

  it("宿泊は期間で効く（最終日の隣の便と繋がる）", () => {
    const out = deriveTripProposals([
      stay("e1", "2026-01-02", "2026-01-08"),
      transit("e2", "2026-01-09"),
    ]);
    expect(out).toHaveLength(1);
    expect([out[0].startDate, out[0].endDate]).toEqual([
      "2026-01-02",
      "2026-01-09",
    ]);
  });

  it("3日以上離れた別の旅行はまとまらない", () => {
    const out = deriveTripProposals([
      transit("e1", "2026-01-01"),
      stay("e2", "2026-01-01", "2026-01-02"),
      transit("e3", "2026-02-10"),
    ]);
    // 並びは開始日の新しい順（compareTripOrder）。
    expect(out).toHaveLength(2);
    expect(out[0].startDate).toBe("2026-02-10");
    expect(out[1].endDate).toBe("2026-01-02");
  });

  it("名前は宿泊の場所を優先（乗り継ぎの経由地に引っ張られない）", () => {
    const out = deriveTripProposals([
      // 経由地の到着空港が2件あっても、宿泊1件の方が重い。
      transit("e1", "2026-01-01", place("ソウル")),
      transit("e2", "2026-01-02", place("ソウル")),
      stay("e3", "2026-01-01", "2026-01-03", place("ホノルル")),
    ]);
    expect(out[0].name).toBe("ホノルル");
  });

  it("市が取れなければ地域に落ちる", () => {
    const out = deriveTripProposals([
      stay("e1", "2026-01-01", "2026-01-03", place(null, "ハワイ")),
    ]);
    expect(out[0].name).toBe("ハワイ");
  });

  it("場所が解決できていなければ名前は無し（呼び出し側が日付で作る）", () => {
    const out = deriveTripProposals([transit("e1", "2026-01-01")]);
    expect(out[0].name).toBeNull();
  });

  it("同日で終わる終日予定は宿泊とみなさない（宿泊は必ず1泊以上）", () => {
    expect(
      deriveTripProposals([stay("e1", "2026-01-01", "2026-01-01")]),
    ).toEqual([]);
  });

  it("同じメールの食事のレシートは期間に影響しない", () => {
    const out = deriveTripProposals([
      transit("e1", "2026-01-05"),
      meal("e1", "2025-11-01"),
    ]);
    expect([out[0].startDate, out[0].endDate]).toEqual([
      "2026-01-05",
      "2026-01-05",
    ]);
  });
});

describe("tripProposalDefaults", () => {
  it("1日しか無い候補は最低1泊を見込む", () => {
    const [p] = deriveTripProposals([transit("e1", "2026-01-01")]);
    expect(tripProposalDefaults(p)).toEqual({
      title: null,
      startDate: "2026-01-01",
      endDate: "2026-01-02",
    });
  });

  it("期間がある候補はそのまま", () => {
    const [p] = deriveTripProposals([
      stay("e1", "2026-01-02", "2026-01-08", place("ホノルル")),
    ]);
    expect(tripProposalDefaults(p)).toEqual({
      title: "ホノルル",
      startDate: "2026-01-02",
      endDate: "2026-01-08",
    });
  });
});

// 「移動か宿泊か」は**候補を作るか**と**日程をどこにするか**のルールで、
// **候補に何が属するか**のルールではない。日程が決まったら、その中の下書きは
// 種別を問わずその候補のものになる（確定した時に一緒に連れて行くため）。
describe("候補に属するもの", () => {
  // ホテルの予約は終日で複数日にまたがる＝宿泊とみなされ、日程を張る。
  const stay = (emailId: string, from: string, to: string) => ({
    emailId,
    kind: "event",
    payload: {
      kind: "allday",
      startDate: from,
      endDate: to,
      resolvedNamedPlace: null,
    },
  });
  const meal = (emailId: string, date: string) => ({
    emailId,
    kind: "expense",
    payload: { date, serviceDate: null, time: null, category: "飲食" },
  });

  it("日程の中のレシートは候補に入る", () => {
    const [p] = deriveTripProposals([
      stay("hotel", "2026-05-01", "2026-05-05"),
      meal("lunch", "2026-05-03"),
    ]);
    expect(p.emailIds.sort()).toEqual(["hotel", "lunch"]);
    // 日程は移動・宿泊だけで決まる（レシートは日程を広げない）。
    expect(p.startDate).toBe("2026-05-01");
    expect(p.endDate).toBe("2026-05-05");
  });

  it("日程の外のレシートは入らない", () => {
    const [p] = deriveTripProposals([
      stay("hotel", "2026-05-01", "2026-05-05"),
      meal("home", "2026-06-20"),
    ]);
    expect(p.emailIds).not.toContain("home");
  });

  it("レシートだけでは候補ができない（作るルールは変わらない）", () => {
    expect(deriveTripProposals([meal("lunch", "2026-05-03")])).toEqual([]);
  });

  // 候補は保存せず、未割り当ての下書き全部から毎回計算し直す。だから
  // **取り込み順に依存しない**: レストランのレシートが先に届いて（その時点では
  // 候補が1つも無い）、後からホテルが届いても、その回の計算で日程が決まって
  // レシートが入る。
  it("レシートが先に届いていても、後から来た宿泊の候補に入る", () => {
    const first = deriveTripProposals([meal("lunch", "2026-05-03")]);
    expect(first).toEqual([]); // レシートだけの時点では候補は無い

    const later = deriveTripProposals([
      meal("lunch", "2026-05-03"),
      stay("hotel", "2026-05-01", "2026-05-05"),
    ]);
    expect(later[0].emailIds.sort()).toEqual(["hotel", "lunch"]);

    // 並び順を変えても同じ（配列の順にも依存しない）。
    const reversed = deriveTripProposals([
      stay("hotel", "2026-05-01", "2026-05-05"),
      meal("lunch", "2026-05-03"),
    ]);
    expect(reversed[0].emailIds.sort()).toEqual(later[0].emailIds.sort());
  });

  it("候補が2つあれば、日程が重なる方に付く", () => {
    const ps = deriveTripProposals([
      stay("mayHotel", "2026-05-01", "2026-05-05"),
      stay("julyHotel", "2026-07-01", "2026-07-05"),
      meal("lunch", "2026-07-03"),
    ]);
    expect(ps).toHaveLength(2);
    const july = ps.find((p) => p.startDate === "2026-07-01")!;
    const may = ps.find((p) => p.startDate === "2026-05-01")!;
    expect(july.emailIds).toContain("lunch");
    expect(may.emailIds).not.toContain("lunch");
  });
});

describe("既にある旅行の期間に収まる候補は出さない", () => {
  const hawaii = [{ startDate: "2026-04-28", endDate: "2026-05-05" }];

  // 実例: ハワイ旅行 4/28〜5/5 の最終日 5/5 21:01 の新幹線（品川→京都）が、
  // 割り当てられずに別の仮旅行として並んだ。その日程の旅行はもうあるので、
  // 割り当て先が増えるだけで選びづらくなる。
  it("旅行の最終日の移動は候補にしない", () => {
    expect(deriveTripProposals([transit("e1", "2026-05-05")], hawaii)).toEqual([]);
  });

  it("旅行の外の移動は候補にする", () => {
    expect(deriveTripProposals([transit("e1", "2026-06-01")], hawaii)).toHaveLength(1);
  });

  it("旅行からはみ出すものは候補にする（延長か別かはこちらで決めない）", () => {
    const out = deriveTripProposals(
      [transit("e1", "2026-05-04"), stay("e2", "2026-05-04", "2026-05-08")],
      hawaii,
    );
    expect(out).toHaveLength(1);
  });

  it("既存の旅行を渡さなければ従来どおり", () => {
    expect(deriveTripProposals([transit("e1", "2026-05-05")])).toHaveLength(1);
  });
});
