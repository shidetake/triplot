import { describe, expect, it } from "vitest";

import {
  TZ_GROUPS,
  tzDisplayLabel,
  tzDisplaySub,
  tzGroupLabel,
} from "./timezones";

describe("表示名", () => {
  it("ロケールで日英を切り替える", () => {
    expect(tzDisplayLabel("Asia/Tokyo", "ja")).toBe("日本");
    expect(tzDisplayLabel("Asia/Tokyo", "en")).toBe("Japan");
    expect(tzDisplayLabel("Pacific/Honolulu", "en")).toBe("Hawaii");
  });

  it("既定は日本語（ロケールを渡さない呼び出しが残っても壊れない）", () => {
    expect(tzDisplayLabel("Asia/Tokyo")).toBe("日本");
  });

  it("収録外は末尾の都市名で代替する（どちらの言語でも）", () => {
    expect(tzDisplayLabel("Antarctica/McMurdo", "en")).toBe("McMurdo");
    expect(tzDisplayLabel("Antarctica/McMurdo", "ja")).toBe("McMurdo");
  });

  it("2行目とグループの見出しも切り替わる", () => {
    const us = TZ_GROUPS.flatMap((g) => g.subGroups)
      .flatMap((sg) => sg.zones)
      .find((z) => z.iana === "America/New_York")!;
    expect(tzDisplayLabel(us.iana, "en")).toBe("Eastern Time");
    expect(tzDisplaySub(us, "en")).toContain("New York");
    expect(tzGroupLabel(TZ_GROUPS[0], "en")).toBe("Asia");
    expect(tzGroupLabel(TZ_GROUPS[0], "ja")).toBe("アジア");
  });

  // 英語名の入れ忘れは画面で気付きにくい（日本語のまま出るのではなく
  // undefined が出る）。全件そろっていることを固定する。
  it("全ゾーンに英語名がある", () => {
    for (const g of TZ_GROUPS) {
      expect(g.labelEn).toBeTruthy();
      for (const sg of g.subGroups) {
        expect(sg.labelEn).toBeTruthy();
        for (const z of sg.zones) {
          expect(z.nameEn, z.iana).toBeTruthy();
          // 2行目は持つ側だけ。持つなら両言語そろっていること。
          expect(!!z.sub, z.iana).toBe(!!z.subEn);
        }
      }
    }
  });
});
