import { formatOffset, tzOffsetMinutes } from "./aiTime";
import type { TripDetailRows } from "./data/reads/tripDetail";
import {
  buildTripTzTimeline,
  resolveEventTz,
  timelineFor,
  timelineForEvent,
  wallClockToUtcMs,
} from "./schedule";
import { deriveScheduleEvents } from "./tripDerive";

// 旅行の中身を、AI が読む文章（Markdown）にする。MCP の道具（get_trip）が返す。
//
// 読むのは AI なので、画面の見た目ではなく**抜けなく・取り違えなく**を優先する。
// - 見出しは英語にする。AI はどの言語でも読め、答える言語は会話で決まる。
//   中身（予定名・メモ等）は利用者が書いたまま。
// - 時刻は現地の時刻に、UTC からの時差とタイムゾーンを添える（AI が書き込む時も
//   同じ形で送る。aiTime.ts）。タイムゾーンは画面と同じ規則で旅程から決める
//   （docs/design/timezone.md）。旅程に移動が無い旅行は、どこにいるかの根拠が
//   無いので添えない。
// - 見えるものは呼んだ本人の権限（RLS）で決まっている。自分だけのものは
//   そうと分かるように印を付ける（AI が他のメンバーに見えている前提で
//   話さないように）。

type Rows = Pick<
  TripDetailRows,
  | "trip"
  | "members"
  | "categoriesRaw"
  | "expensesRaw"
  | "placesRaw"
  | "eventsRaw"
  | "todosRaw"
  | "notesRaw"
  | "pinOptionsRaw"
>;

// "2027-08-10T20:55:00" → "2027-08-10 20:55"
function wallClock(ts: string | null): string {
  if (!ts) return "";
  return ts.slice(0, 16).replace("T", " ");
}

function dateOf(ts: string | null): string {
  return ts ? ts.slice(0, 10) : "";
}

function timeOf(ts: string | null): string {
  return ts ? ts.slice(11, 16) : "";
}

function oneLine(s: string | null | undefined): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

function list(names: string[]): string {
  return names.length > 0 ? names.join(", ") : "(none)";
}

export function tripForAi(rows: Rows): string {
  const { trip } = rows;
  if (!trip) return "Trip not found.";

  const memberName = new Map(
    (rows.members ?? []).map((m) => [m.id, m.display_name]),
  );
  const nameOf = (id: string | null) =>
    (id && memberName.get(id)) || "(unknown)";
  const placeName = new Map(
    (rows.placesRaw ?? []).map((p) => [p.id, p.name]),
  );
  const categoryName = new Map(
    (rows.categoriesRaw ?? []).map((c) => [c.id, c.name]),
  );
  const privateMark = (visibility: string) =>
    visibility === "private" ? " [private: only you can see this]" : "";

  // 時差を添えるための旅程（画面と同じ規則。移動が無ければ添えない）。
  const scheduleEvents = deriveScheduleEvents(rows.eventsRaw, rows.todosRaw);
  const timeline = buildTripTzTimeline(scheduleEvents, trip.default_timezone);
  const knowsZones = timeline.transits.length > 0;
  const zoned = (wall: string | null, tz: string | null) => {
    if (!wall) return "";
    if (!tz) return wallClock(wall);
    return `${wallClock(wall)} (UTC${formatOffset(tzOffsetMinutes(tz, wall.slice(0, 16)))} ${tz})`;
  };

  const out: string[] = [];
  out.push(`# ${trip.title}`);
  out.push("");
  out.push(
    `- Dates: ${trip.start_date ?? "(not set)"} – ${trip.end_date ?? "(not set)"}`,
  );
  out.push(`- Settlement currency: ${trip.default_currency}`);
  if (trip.default_timezone) {
    out.push(`- Home time zone: ${trip.default_timezone}`);
  }

  const active = (rows.members ?? []).filter((m) => m.left_at === null);
  const left = (rows.members ?? []).filter((m) => m.left_at !== null);
  out.push(`- Members: ${list(active.map((m) => m.display_name))}`);
  out.push(
    `- Expense categories: ${list((rows.categoriesRaw ?? []).map((c) => c.name))}`,
  );
  if (left.length > 0) {
    out.push(`- Former members: ${list(left.map((m) => m.display_name))}`);
  }

  // ── 予定 ──
  out.push("");
  out.push("## Schedule");
  out.push(
    knowsZones
      ? "Times are local times at the place, with the UTC offset and time zone. Transit (flights etc.) shows each end in its own time zone. Use the same form (e.g. 2027-08-11T12:00-10:00) when adding."
      : "Times are local times at the place. This trip has no transit, so its time zones are not known; when adding, send the local time with the offset of the place.",
  );
  // 並びは実際の時刻順（移動の日は、出発地の 20:55 が到着地の 15:00 より先に
  // 来ることがある。壁時計の文字列で並べると逆になる）。日付の見出しは現地の日付。
  const tzOfEvent = (e: (typeof rows.eventsRaw & {})[number]) => {
    if (e.kind === "transit") return e.start_tz;
    if (!knowsZones || e.all_day) return null;
    const ev = scheduleEvents.find((x) => x.id === e.id);
    return ev
      ? resolveEventTz(
          dateOf(e.start_at),
          ev.tzDisambigTransitId,
          ev.tzDisambigSide,
          timelineForEvent(timeline, ev),
        )
      : null;
  };
  const instant = (e: (typeof rows.eventsRaw & {})[number]) => {
    const tz = tzOfEvent(e);
    const wall = e.start_at.slice(0, 16);
    return tz ? wallClockToUtcMs(wall, tz) : Date.parse(`${wall}:00Z`);
  };
  const events = [...(rows.eventsRaw ?? [])].sort(
    (a, b) =>
      dateOf(a.start_at).localeCompare(dateOf(b.start_at)) ||
      Number(b.all_day) - Number(a.all_day) ||
      instant(a) - instant(b),
  );
  if (events.length === 0) out.push("(no events)");
  let day = "";
  for (const e of events) {
    const d = dateOf(e.start_at);
    if (d !== day) {
      day = d;
      out.push("");
      out.push(`### ${d}`);
    }
    let when: string;
    if (e.all_day) {
      const end = dateOf(e.end_at);
      when = end && end !== d ? `all day until ${end}` : "all day";
    } else if (e.kind === "transit") {
      when = `${zoned(e.start_at, e.start_tz)} → ${zoned(e.end_at, e.end_tz)}`;
    } else {
      const tz = tzOfEvent(e);
      const sameDay = dateOf(e.end_at) === d;
      const end = sameDay ? timeOf(e.end_at) : wallClock(e.end_at);
      when = tz
        ? `${timeOf(e.start_at)}–${end} (UTC${formatOffset(tzOffsetMinutes(tz, e.start_at.slice(0, 16)))} ${tz})`
        : `${timeOf(e.start_at)}–${end}`;
    }
    const from = e.start_place_id ? placeName.get(e.start_place_id) : null;
    const to = e.end_place_id ? placeName.get(e.end_place_id) : null;
    const where =
      e.kind === "transit" && (from || to)
        ? ` (from ${from ?? "?"} to ${to ?? "?"})`
        : from
          ? ` @ ${from}`
          : "";
    const who = e.participants_everyone
      ? "everyone"
      : list((e.event_participants ?? []).map((p) => nameOf(p.member_id)));
    out.push(
      `- ${when} ${e.kind === "transit" ? "[transit] " : ""}${oneLine(e.title)}${where} — participants: ${who}${privateMark(e.visibility)}`,
    );
    if (oneLine(e.note)) out.push(`  - note: ${oneLine(e.note)}`);
  }

  // ── 場所 ──
  out.push("");
  out.push("## Places");
  const places = rows.placesRaw ?? [];
  if (places.length === 0) out.push("(no places)");
  for (const [label, tentative] of [
    ["Decided", false],
    ["Candidates (not decided yet)", true],
  ] as const) {
    const group = places.filter((p) => p.tentative === tentative);
    if (group.length === 0) continue;
    out.push("");
    out.push(`### ${label}`);
    for (const p of group) {
      const area = oneLine(p.formatted_address) || oneLine(
        [p.locality, p.region].filter(Boolean).join(", "),
      );
      out.push(
        `- ${oneLine(p.name)}${area ? ` — ${area}` : ""}${p.lat === null ? " (location not set)" : ""}${privateMark(p.visibility)}`,
      );
      if (oneLine(p.note)) out.push(`  - note: ${oneLine(p.note)}`);
    }
  }

  // ── 費用 ──
  out.push("");
  out.push("## Expenses");
  const expenses = [...(rows.expensesRaw ?? [])].sort((a, b) =>
    (a.paid_at ?? "").localeCompare(b.paid_at ?? ""),
  );
  if (expenses.length === 0) out.push("(no expenses)");
  for (const x of expenses) {
    const amount = `${x.local_price} ${x.local_currency}`;
    const converted =
      x.local_currency !== trip.default_currency
        ? ` (≈ ${Math.round(x.local_price * x.rate_to_default * 100) / 100} ${trip.default_currency})`
        : "";
    const split = !x.splittable
      ? "not split"
      : x.split_everyone
        ? "split among everyone"
        : `split among ${list((x.expense_splits ?? []).map((s) => nameOf(s.member_id)))}`;
    const place = x.place_id ? placeName.get(x.place_id) : null;
    const category = categoryName.get(x.category_id) ?? "(uncategorized)";
    // 時刻が 00:00 の費用は時刻を入れていないもの（ui-guidelines の日時の表示）。
    // 時刻があれば、払った人の居場所のタイムゾーンを添える。
    const paidTz =
      knowsZones && x.paid_at
        ? resolveEventTz(
            dateOf(x.paid_at),
            x.tz_disambig_transit_id,
            x.tz_disambig_side as "depart" | "arrive" | null,
            timelineFor(timeline, [x.payer_member_id]),
          )
        : null;
    const paid =
      timeOf(x.paid_at) === "00:00"
        ? dateOf(x.paid_at)
        : zoned(x.paid_at, paidTz);
    out.push(
      `- ${paid} ${amount}${converted} — ${category} — paid by ${nameOf(x.payer_member_id)} — ${split}${place ? ` — @ ${place}` : ""}${privateMark(x.visibility)}`,
    );
    if (oneLine(x.note)) out.push(`  - note: ${oneLine(x.note)}`);
  }

  // ── TODO ──
  out.push("");
  out.push("## To-dos");
  const todos = rows.todosRaw ?? [];
  if (todos.length === 0) out.push("(no to-dos)");
  for (const t of todos) {
    const assignees = t.assignee_everyone
      ? "everyone"
      : (t.todo_assignees ?? []).length > 0
        ? list((t.todo_assignees ?? []).map((a) => nameOf(a.member_id)))
        : "unassigned";
    const doneBy = (t.todo_completions ?? []).map((c) => nameOf(c.member_id));
    out.push(
      `- [${t.done ? "x" : " "}] ${oneLine(t.title)} — ${t.kind === "onsite" ? "during the trip" : "before the trip"} — priority: ${t.priority} — assignee: ${assignees}${doneBy.length > 0 && !t.done ? ` — done by: ${list(doneBy)}` : ""}${privateMark(t.visibility)}`,
    );
  }

  // ── ノート ──
  out.push("");
  out.push("## Notes");
  const notes = (rows.notesRaw ?? []).filter((n) => oneLine(n.body));
  if (notes.length === 0) out.push("(no notes)");
  for (const n of notes) {
    out.push("");
    out.push(
      `### ${n.visibility === "private" ? "Private note (only you can see this)" : "Shared note"}`,
    );
    out.push(n.body.trim());
  }

  return out.join("\n") + "\n";
}
