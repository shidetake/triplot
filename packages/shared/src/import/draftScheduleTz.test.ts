import { describe, expect, it } from "vitest";

import { isTzBoundary } from "../schedule";

import { draftToScheduleEvent, type EventDraftItem } from "./drafts";

// 仮予定を疑似イベントに変換するときの TZ の決め方。
//
// カレンダーの列はここで決まった TZ から組まれるので、**保存した時と同じ答え**に
// ならないと、確定する前後で予定の置かれる列が変わってしまう。
const NRT = { lat: 35.765, lng: 140.386 };
const HNL = { lat: 21.319, lng: -157.922 };

function transitItem(o: {
  place: EventDraftItem["prefill"]["place"];
  endPlace: EventDraftItem["prefill"]["endPlace"];
  departTz?: string | null;
  arriveTz?: string | null;
  tz?: string;
}): EventDraftItem {
  return {
    id: "d1",
    draftIds: ["d1"],
    emailIds: ["e1"],
    labelParts: ["移動", "4/28 19:10"],
    date: "2026-04-28",
    time: "19:10",
    tz: o.tz ?? "Asia/Tokyo",
    prefill: {
      kind3: "transit",
      tzDisambig: null,
      title: "移動",
      note: null,
      endDate: "2026-04-28",
      endTime: "07:25",
      departTz: o.departTz ?? null,
      arriveTz: o.arriveTz ?? null,
      place: o.place,
      endPlace: o.endPlace,
      autoResolvePlace: null,
      flightNumber: null,
    },
  };
}

const google = (name: string, c: { lat: number; lng: number }) =>
  ({
    kind: "google",
    placeId: `p-${name}`,
    name,
    address: "",
    lat: c.lat,
    lng: c.lng,
    region: null,
    locality: null,
    icon: null,
  }) as EventDraftItem["prefill"]["place"];

describe("移動の仮予定の TZ", () => {
  // prefill の departTz/arriveTz は「上書き」で、座標が分かる端点では置かない
  // 規約（event-form の applyFlight と同じ）。そのまま実効値として読むと
  // フライトの TZ 境界が消える。
  it("上書きが無くても、空港の座標から境界が出る", () => {
    const ev = draftToScheduleEvent(
      transitItem({
        place: google("成田", NRT),
        endPlace: google("ホノルル", HNL),
      }),
      "me",
    );
    expect(ev.kind).toBe("transit");
    expect(ev.startTz).toBe("Asia/Tokyo");
    expect(ev.endTz).toBe("Pacific/Honolulu");
  });

  // 抽出は配車・タクシーも kind='transit' で作るが、保存時は時差が無ければ
  // 通常の予定になる（crossesTimezone）。疑似イベントも同じにしないと、
  // 年表の現在 TZ を推測値で上書きしてしまう。
  // **移動は移動のまま。** 種別を書き換えたり、DB に無い形のデータを作ったり
  // しない。境界として扱うかどうかは「時差があるか」で判定する（isTzBoundary）。
  it("時差が無くても移動のまま、両側の TZ を持つ", () => {
    const ev = draftToScheduleEvent(
      transitItem({
        place: google("乗車地", HNL),
        endPlace: google("降車地", HNL),
      }),
      "me",
    );
    expect(ev.kind).toBe("transit");
    expect(ev.startTz).toBe("Pacific/Honolulu");
    expect(ev.endTz).toBe("Pacific/Honolulu");
    // 時差が無いので旅程の境界にはならない。
    expect(isTzBoundary(ev)).toBe(false);
  });

  // 片方だけ座標が取れた乗車が「ホノルル → 東京」の幽霊の境界を作っていた
  // （決められない側が旅行の既定 TZ に落ちていたため）。
  it("片方しか決められないときは、もう片方に合わせる", () => {
    const ev = draftToScheduleEvent(
      transitItem({
        place: google("乗車地", HNL),
        endPlace: { kind: "free", name: "降車地", lat: null, lng: null },
        tz: "Asia/Tokyo",
      }),
      "me",
    );
    // 決められない側を既定 TZ に落とすと「ホノルル → 東京」の幽霊の境界ができる。
    expect(ev.startTz).toBe("Pacific/Honolulu");
    expect(ev.endTz).toBe("Pacific/Honolulu");
    expect(isTzBoundary(ev)).toBe(false);
  });
});
