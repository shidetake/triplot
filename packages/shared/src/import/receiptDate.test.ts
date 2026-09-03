import { describe, expect, it } from "vitest";

import { chooseAuthoritativeDate } from "./receiptDate";

const receipt = (date: string, dateIsSettlement: boolean) => ({
  date,
  time: null,
  serviceDate: null,
  dateIsSettlement,
});

describe("chooseAuthoritativeDate", () => {
  it("レシート由来が銀行の通知に勝つ（合体の対象がレシート）", () => {
    const target = receipt("2026-04-30", false);
    const incoming = receipt("2026-05-01", true);
    expect(chooseAuthoritativeDate(target, incoming)).toBe(target);
  });

  it("レシート由来が銀行の通知に勝つ（新しく届いた側がレシート）", () => {
    // Howzit の実例: 先に通知（5/1）が入り、後からレシート（4/30）が合体する。
    const target = receipt("2026-05-01", true);
    const incoming = receipt("2026-04-30", false);
    expect(chooseAuthoritativeDate(target, incoming)).toBe(incoming);
  });

  it("両方レシート由来なら新しく分かった方（incoming）", () => {
    const target = receipt("2026-04-30", false);
    const incoming = receipt("2026-04-30", false);
    expect(chooseAuthoritativeDate(target, incoming)).toBe(incoming);
  });

  it("両方通知のみでも新しく分かった方（incoming）", () => {
    const target = receipt("2026-05-01", true);
    const incoming = receipt("2026-05-02", true);
    expect(chooseAuthoritativeDate(target, incoming)).toBe(incoming);
  });
});
