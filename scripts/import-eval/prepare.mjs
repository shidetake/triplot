// 「流す前の状態」を staging の旅行に作る（docs/import-eval.md）。
//   1. staging の評価用の旅行の中身（費用・予定・場所・TODO）を空にする
//   2. 本番の旅行から、時差のあるフライト（start_tz と end_tz が違う移動）だけを
//      確定済みの予定として写す（空港の場所も写す）
//
// 本番は読むだけ。staging は評価用の旅行の中だけを書く（他の旅行・他のユーザーには触らない）。
// フライトを入れておくのは、取り込みの日時がフライトの時差を前提に決まるため
// （本番で利用者が取り込む時も、フライトは先に確定している）。

import { lit, loadSet, prodQuery, stagingQuery } from "./lib.mjs";

const num = (v) => (v === null || v === undefined ? "null" : Number(v));

export async function prepare(set) {
  const flights = await prodQuery(`
    select v.title, v.start_at::text start_at, v.end_at::text end_at, v.start_tz, v.end_tz, v.note,
           row_to_json(sp) sp, row_to_json(ep) ep
    from events v
    join (select id, name, icon, lat, lng, google_place_id, formatted_address, locality, region from places) sp on sp.id = v.start_place_id
    join (select id, name, icon, lat, lng, google_place_id, formatted_address, locality, region from places) ep on ep.id = v.end_place_id
    where v.trip_id = ${lit(set.prodTrip)} and v.kind = 'transit' and v.start_tz is distinct from v.end_tz
    order by v.start_at`);

  const trip = lit(set.stagingTrip);
  for (const table of ["expenses", "events", "places", "todos"]) {
    stagingQuery(`delete from ${table} where trip_id = ${trip}`);
  }

  const [member] = stagingQuery(`
    select m.id from trip_members m join auth.users u on u.id = m.user_id
    where m.trip_id = ${trip} and u.email = 'shidetake@gmail.com' and m.left_at is null`);
  if (!member) throw new Error("staging の旅行に開発用アカウントのメンバーがいない");

  const placeIds = new Map();
  for (const p of flights.flatMap((f) => [f.sp, f.ep])) {
    if (placeIds.has(p.google_place_id)) continue;
    const [row] = stagingQuery(`
      insert into places (trip_id, created_by_member_id, visibility, name, icon, lat, lng, google_place_id, formatted_address, locality, region)
      values (${trip}, '${member.id}', 'shared', ${lit(p.name)}, ${lit(p.icon)}, ${num(p.lat)}, ${num(p.lng)}, ${lit(p.google_place_id)}, ${lit(p.formatted_address)}, ${lit(p.locality)}, ${lit(p.region)})
      returning id`);
    placeIds.set(p.google_place_id, row.id);
  }
  for (const f of flights) {
    stagingQuery(`
      insert into events (trip_id, created_by_member_id, visibility, kind, all_day, title, start_at, end_at, start_tz, end_tz, note, participants_everyone, start_place_id, end_place_id)
      values (${trip}, '${member.id}', 'shared', 'transit', false, ${lit(f.title)}, ${lit(f.start_at)}, ${lit(f.end_at)}, ${lit(f.start_tz)}, ${lit(f.end_tz)}, ${lit(f.note)}, true,
              '${placeIds.get(f.sp.google_place_id)}', '${placeIds.get(f.ep.google_place_id)}')`);
  }

  const [state] = stagingQuery(`
    select (select count(*) from expenses where trip_id = ${trip})::int expenses,
           (select count(*) from events where trip_id = ${trip})::int events,
           (select count(*) from places where trip_id = ${trip})::int places,
           (select count(*) from todos where trip_id = ${trip})::int todos`);
  console.log(
    `流す前の状態: フライト ${flights.map((f) => f.title).join(" / ")}（予定 ${state.events}・費用 ${state.expenses}・場所 ${state.places}・TODO ${state.todos}）`,
  );
}

if (import.meta.main) {
  const name = process.argv[2];
  if (!name) {
    console.error("使い方: node scripts/import-eval/prepare.mjs <組>");
    process.exit(1);
  }
  await prepare(loadSet(name));
}
