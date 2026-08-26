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
