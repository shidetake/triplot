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
