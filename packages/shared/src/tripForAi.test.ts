import { describe, expect, it } from "vitest";

import { tripForAi } from "./tripForAi";

type Rows = Parameters<typeof tripForAi>[0];

const base: Rows = {
  trip: {
    id: "t1",
    title: "ハワイ",
    start_date: "2027-08-10",
    end_date: "2027-08-16",
    default_currency: "JPY",
    default_timezone: "Asia/Tokyo",
  },
  members: [
    {
      id: "m1",
      user_id: "u1",
      display_name: "たけ",
      kind: "user",
      color: 10,
      is_admin: true,
      left_at: null,
      users: { avatar_url: null },
    },
    {
      id: "m2",
      user_id: "u2",
      display_name: "はな",
      kind: "user",
      color: 200,
      is_admin: false,
      left_at: null,
      users: { avatar_url: null },
    },
  ],
  categoriesRaw: [
    { id: "c1", name: "飲食", color: "#f00", icon: "food", sort_order: 1, key: "food" },
  ],
  expensesRaw: [],
  placesRaw: [],
  eventsRaw: [],
  todosRaw: [],
  notesRaw: [],
} as unknown as Rows;

describe("tripForAi", () => {
  it("writes the trip header and empty sections", () => {
    const md = tripForAi(base);
    expect(md).toContain("# ハワイ");
    expect(md).toContain("- Dates: 2027-08-10 – 2027-08-16");
    expect(md).toContain("- Members: たけ, はな");
    expect(md).toContain("(no events)");
    expect(md).toContain("(no notes)");
  });

  it("writes times with the UTC offset and time zone the itinerary gives them", () => {
    const md = tripForAi({
      ...base,
      placesRaw: [
        { id: "p1", name: "成田国際空港", tentative: false, lat: 1, visibility: "shared" },
        { id: "p2", name: "ダニエル・K・イノウエ国際空港", tentative: false, lat: 1, visibility: "shared" },
      ],
      eventsRaw: [
        {
          id: "e2",
          title: "ワイキキで夕日を見る",
          kind: "normal",
          all_day: false,
          start_at: "2027-08-11T18:30:00",
          end_at: "2027-08-11T19:30:00",
          start_tz: null,
          end_tz: null,
          start_place_id: null,
          end_place_id: null,
          visibility: "shared",
          note: null,
          participants_everyone: false,
          event_participants: [{ member_id: "m2" }],
          tz_disambig_transit_id: null,
          tz_disambig_side: null,
        },
        {
          id: "e1",
          title: "成田 → ホノルル",
          kind: "transit",
          all_day: false,
          start_at: "2027-08-10T20:55:00",
          end_at: "2027-08-10T09:25:00",
          start_tz: "Asia/Tokyo",
          end_tz: "Pacific/Honolulu",
          start_place_id: "p1",
          end_place_id: "p2",
          visibility: "shared",
          note: null,
          participants_everyone: true,
          event_participants: [],
        },
      ],
    } as unknown as Rows);
    const transit = md.indexOf("[transit] 成田 → ホノルル");
    const sunset = md.indexOf("ワイキキで夕日を見る");
    expect(transit).toBeGreaterThan(-1);
    expect(sunset).toBeGreaterThan(transit);
    expect(md).toContain(
      "- 2027-08-10 20:55 (UTC+09:00 Asia/Tokyo) → 2027-08-10 09:25 (UTC-10:00 Pacific/Honolulu) [transit] 成田 → ホノルル (from 成田国際空港 to ダニエル・K・イノウエ国際空港) — participants: everyone (id: e1)",
    );
    // 移動の後の日は、到着地のタイムゾーンと時差が付く（AI が同じ形で書き込めるように）。
    expect(md).toContain(
      "- 18:30–19:30 (UTC-10:00 Pacific/Honolulu) ワイキキで夕日を見る — participants: はな (id: e2)",
    );
  });

  it("converts foreign-currency expenses and names the payer and split", () => {
    const md = tripForAi({
      ...base,
      expensesRaw: [
        {
          id: "x1",
          local_price: 12.5,
          local_currency: "USD",
          rate_to_default: 150,
          category_id: "c1",
          visibility: "shared",
          splittable: true,
          note: "朝食",
          paid_at: "2027-08-11T08:00:00",
          payer_member_id: "m1",
          place_id: null,
          split_everyone: true,
          expense_splits: [],
        },
      ],
    } as unknown as Rows);
    expect(md).toContain(
      "- 2027-08-11 08:00 12.5 USD (≈ 1875 JPY) — 飲食 — paid by たけ — split among everyone (id: x1)",
    );
    expect(md).toContain("  - note: 朝食");
  });

  it("marks private items so the AI does not assume others can see them", () => {
    const md = tripForAi({
      ...base,
      todosRaw: [
        {
          id: "td1",
          title: "ESTA を申請",
          priority: "high",
          kind: "prep",
          done: false,
          assignee_everyone: true,
          visibility: "private",
          todo_assignees: [],
          todo_completions: [{ member_id: "m1" }],
        },
      ],
      notesRaw: [{ id: "n1", body: "集合は 7:00", visibility: "private" }],
    } as unknown as Rows);
    expect(md).toContain(
      "- [ ] ESTA を申請 — before the trip — priority: high — assignee: everyone — done by: たけ [private: only you can see this] (id: td1)",
    );
    expect(md).toContain("### Private note (only you can see this)\n集合は 7:00");
  });

  it("separates decided places from candidates", () => {
    const md = tripForAi({
      ...base,
      placesRaw: [
        { id: "p1", name: "ハナウマ湾", tentative: true, lat: 1, locality: "Honolulu", region: "HI", visibility: "shared" },
        { id: "p2", name: "ハレクラニ", tentative: false, lat: null, visibility: "shared" },
      ],
    } as unknown as Rows);
    expect(md.indexOf("### Decided")).toBeLessThan(md.indexOf("ハレクラニ"));
    expect(md).toContain("- ハレクラニ (location not set) (id: p2)");
    expect(md.indexOf("### Candidates")).toBeLessThan(md.indexOf("ハナウマ湾"));
    expect(md).toContain("- ハナウマ湾 — Honolulu, HI (id: p1)");
  });
});
