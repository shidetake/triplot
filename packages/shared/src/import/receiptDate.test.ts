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

  // 予約の確認メールを当日の明細が上書きすることがあるので、レシートどうしなら
  // 後から届いた方を採る。
  it("両方レシート由来なら新しく分かった方（incoming）", () => {
    const target = receipt("2026-04-30", false);
    const incoming = receipt("2026-05-01", false);
    expect(chooseAuthoritativeDate(target, incoming)).toBe(incoming);
  });

  // 実例: 同じ承認番号の〔5/2 の利用 ＋ 5/4 の確定〕。金額が足し算にならず
  // summed に掛からなかったため、5/1 の会計が 5/3 になっていた。
  it("両方が銀行の通知なら古い方（確定・調整は利用の後にしか来ない）", () => {
    const target = receipt("2026-05-01", true);
    const incoming = receipt("2026-05-02", true);
    expect(chooseAuthoritativeDate(target, incoming)).toBe(target);
  });

  it("両方が銀行の通知なら届いた順に依らず古い方", () => {
    const target = receipt("2026-05-02", true);
    const incoming = receipt("2026-05-01", true);
    expect(chooseAuthoritativeDate(target, incoming)).toBe(incoming);
  });

  // Howzit の実例: 5/1 の利用 67.02 に 5/2 の調整 12.06 が足されて 79.08 になる。
  // 調整は後からしか来ないので、取引が起きたのは 5/1。
  it("金額が足されたなら古い方の日付（調整は後からしか来ない）", () => {
    const target = receipt("2026-05-01", true);
    const incoming = receipt("2026-05-02", true);
    expect(chooseAuthoritativeDate(target, incoming, { summed: true })).toBe(
      target,
    );
  });

  it("足されたのが先に届いていても古い方（届いた順に依らない）", () => {
    const target = receipt("2026-05-02", true);
    const incoming = receipt("2026-05-01", true);
    expect(chooseAuthoritativeDate(target, incoming, { summed: true })).toBe(
      incoming,
    );
  });

  it("レシートどうしなら足していない限り incoming のまま", () => {
    const target = receipt("2026-05-01", false);
    const incoming = receipt("2026-05-02", false);
    expect(chooseAuthoritativeDate(target, incoming, { summed: false })).toBe(
      incoming,
    );
  });

  it("レシートどうしでも足したなら古い方", () => {
    const target = receipt("2026-05-01", false);
    const incoming = receipt("2026-05-02", false);
    expect(chooseAuthoritativeDate(target, incoming, { summed: true })).toBe(
      target,
    );
  });

  it("足されていてもレシート由来が勝つ（片方向のルールが先）", () => {
    const target = receipt("2026-05-01", true);
    const incoming = receipt("2026-04-30", false);
    expect(chooseAuthoritativeDate(target, incoming, { summed: true })).toBe(
      incoming,
    );
  });
});
