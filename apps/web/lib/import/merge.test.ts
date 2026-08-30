import { describe, expect, it } from "vitest";

import { type DraftCandidate, selectMergeCandidates } from "./merge";
import type { EventDraft, Extraction, Receipt } from "@triplot/shared/import/schema";

function receipt(p: Partial<Receipt>): Receipt {
  return {
    merchant: "X",
    total: 10,
    currency: "USD",
    date: "2026-05-05",
    serviceDate: null,
    time: null,
    category: "その他",
    location: null,
    address: null,
    items: null,
    referenceId: null,
    isUpdate: false,
    ...p,
  };
}

function event(p: Partial<EventDraft>): EventDraft {
  return {
    kind: "transit",
    title: "NRT-HNL",
    startDate: "2026-05-05",
    startTime: "21:00",
    endDate: "2026-05-05",
    endTime: "09:55",
    departTz: "Asia/Tokyo",
    arriveTz: "Pacific/Honolulu",
    vehicleNumber: null,
    departTerminal: null,
    arriveTerminal: null,
    departLocation: null,
    arriveLocation: null,
    location: null,
    address: null,
    referenceId: null,
    isUpdate: false,
    ...p,
  };
}

function withReceipt(r: Receipt): Extraction {
  return { receipt: r, events: [] };
}

describe("selectMergeCandidates", () => {
  it("referenceId が一致する下書きを候補にする（日付が離れていても）", () => {
    const incoming = withReceipt(
      receipt({ date: "2026-05-07", referenceId: "899402" }),
    );
    const drafts: DraftCandidate[] = [
      {
        id: "a",
        extraction: withReceipt(
          receipt({ date: "2026-05-05", referenceId: "899402" }),
        ),
      },
      {
        id: "b",
        extraction: withReceipt(
          receipt({ date: "2026-01-01", referenceId: "000000" }),
        ),
      },
    ];
    expect(selectMergeCandidates(incoming, drafts).map((c) => c.id)).toEqual(["a"]);
  });

  it("日付が window 内なら候補（referenceId 無しでも）", () => {
    const incoming = withReceipt(receipt({ date: "2026-05-07" }));
    const drafts: DraftCandidate[] = [
      { id: "a", extraction: withReceipt(receipt({ date: "2026-05-05" })) }, // 2日差
      { id: "b", extraction: withReceipt(receipt({ date: "2026-04-01" })) }, // 遠い
    ];
    expect(selectMergeCandidates(incoming, drafts).map((c) => c.id)).toEqual(["a"]);
  });

  it("referenceId 一致を先頭に並べる", () => {
    const incoming = withReceipt(receipt({ date: "2026-05-07", referenceId: "R" }));
    const drafts: DraftCandidate[] = [
      { id: "near", extraction: withReceipt(receipt({ date: "2026-05-06" })) },
      {
        id: "ref",
        extraction: withReceipt(receipt({ date: "2026-05-04", referenceId: "R" })),
      },
    ];
    expect(selectMergeCandidates(incoming, drafts).map((c) => c.id)).toEqual([
      "ref",
      "near",
    ]);
  });

  it("max で件数を絞る", () => {
    const incoming = withReceipt(receipt({ date: "2026-05-07" }));
    const drafts: DraftCandidate[] = Array.from({ length: 12 }, (_, i) => ({
      id: String(i),
      extraction: withReceipt(receipt({ date: "2026-05-06" })),
    }));
    expect(selectMergeCandidates(incoming, drafts, { max: 3 })).toHaveLength(3);
  });

  it("予定の referenceId 一致でも候補になる（費用なしメール同士）", () => {
    const incoming: Extraction = {
      receipt: null,
      events: [
        event({ referenceId: "ABC123", startDate: "2026-08-01", endDate: null }),
      ],
    };
    const drafts: DraftCandidate[] = [
      {
        id: "a",
        extraction: {
          receipt: null,
          events: [
            event({ referenceId: "ABC123", startDate: "2026-06-01", endDate: null }),
          ],
        },
      },
      {
        id: "b",
        extraction: {
          receipt: null,
          events: [
            event({ referenceId: "ZZZ999", startDate: "2026-01-01", endDate: null }),
          ],
        },
      },
    ];
    expect(selectMergeCandidates(incoming, drafts).map((c) => c.id)).toEqual(["a"]);
  });

  it("予定の日付が window 内なら候補（費用の日付が遠くても）", () => {
    const incoming: Extraction = {
      receipt: receipt({ date: "2026-01-01" }),
      events: [event({ startDate: "2026-05-06", endDate: null })],
    };
    const drafts: DraftCandidate[] = [
      {
        id: "a",
        extraction: {
          receipt: null,
          events: [event({ startDate: "2026-05-05", endDate: null })],
        },
      },
    ];
    expect(selectMergeCandidates(incoming, drafts).map((c) => c.id)).toEqual(["a"]);
  });
});

// 候補の順位付け。**判定ではなく、LLM に見せる数件をどう選ぶか**だけを決める。
// 直す前は「番号一致 or 14日以内」で絞ったあと順不同に切っていて、旅行中の
// メールは全部通るので実質フィルタが効いていなかった（実データで、同時に未確定の
// 34件から8件を引いていて、金額が完全一致する店/銀行のペアが12組中11組で
// 合体できていなかった）。
describe("selectMergeCandidates の順位付け", () => {
  const cand = (
    id: string,
    o: { total?: number; merchant?: string; date?: string; ref?: string },
  ): DraftCandidate => ({
    id,
    extraction: {
      receipt: {
        ...receipt({}),
        merchant: o.merchant ?? "無関係な店",
        total: o.total ?? 1,
        date: o.date ?? "2026-05-01",
        referenceId: o.ref ?? null,
      },
      events: [],
    },
  });

  // 銀行の通知（全角・略記・日付が翌日）で届いたつもりの incoming。
  const incoming = {
    receipt: {
      ...receipt({}),
      merchant: "UNIQLO Ala Moana",
      total: 62.62,
      date: "2026-05-02",
      referenceId: "350930",
    },
    events: [],
  };

  it("金額が完全一致する候補を先頭に出す", () => {
    const out = selectMergeCandidates(incoming, [
      cand("noise1", { total: 10, date: "2026-05-02" }),
      cand("noise2", { total: 20, date: "2026-05-02" }),
      cand("shop", { total: 62.62, merchant: "UNIQLO", date: "2026-05-01" }),
    ]);
    expect(out[0].id).toBe("shop");
  });

  // チップだけ別メール・Uber の分割請求では金額が一致しない。店名で拾う。
  it("金額が割れていても店名が似ていれば候補に残る（チップ分割）", () => {
    const out = selectMergeCandidates(
      incoming,
      [
        cand("noise1", { total: 10, merchant: "無関係な店", date: "2026-05-02" }),
        cand("noise2", { total: 20, merchant: "別の店", date: "2026-05-02" }),
        cand("tip", { total: 55.0, merchant: "UNIQLO", date: "2026-05-01" }),
      ],
      { max: 1 },
    );
    expect(out.map((o) => o.id)).toEqual(["tip"]);
  });

  it("識別番号の一致が最優先", () => {
    const out = selectMergeCandidates(incoming, [
      cand("amount", { total: 62.62, merchant: "UNIQLO", date: "2026-05-01" }),
      cand("ref", { total: 1, merchant: "別の店", ref: "350930" }),
    ]);
    expect(out[0].id).toBe("ref");
  });

  it("上限を超えたら弱い候補から落ちる", () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      cand(`n${i}`, { total: i + 1, date: "2026-05-02" }),
    );
    const out = selectMergeCandidates(
      incoming,
      [...many, cand("shop", { total: 62.62, merchant: "UNIQLO" })],
      { max: 3 },
    );
    expect(out).toHaveLength(3);
    expect(out[0].id).toBe("shop");
  });
});
