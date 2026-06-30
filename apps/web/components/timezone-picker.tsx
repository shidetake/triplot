"use client";

import { useState } from "react";

import { Popover } from "@base-ui/react/popover";

import { CheckIcon, ChevronIcon } from "./icons";
import { inputClass } from "./input-class";
import { menuItemClass } from "./menu-item";

function cityOf(iana: string): string {
  return iana.split("/").pop()?.replace(/_/g, " ") ?? iana;
}

export function tzDisplayLabel(iana: string): string {
  return ALL_TZ_MAP.get(iana)?.name ?? cityOf(iana);
}

export function useTzLabel(): (iana: string) => string {
  return (iana: string) => ALL_TZ_MAP.get(iana)?.name ?? cityOf(iana);
}

// name/sub/並び順のルール（ドキュメント: docs/ui-guidelines.md「タイムゾーンピッカーの命名ルール」）:
//   1か国1ゾーン  → 国名（日本・フランス・アルゼンチン）。sub なし
//   複数国1ゾーン → ゾーン/地域名（東アフリカ・西アフリカ）。sub に主要都市
//   国内複数ゾーン → ゾーン/地域名（東部時間・オーストラリア東部）。sub に各都市
// 「時間」は省略可能なら省く。「東部時間」等は「東部」だと日本の地域と紛れるため「時間」を残す。
// 並び順: グループ内 UTC オフセット昇順（西→東）、同値は五十音順。
const TZ_GROUPS: Array<{
  label: string;
  zones: Array<{ iana: string; name: string; sub?: string }>;
}> = [
  {
    label: "アジア",
    zones: [
      { iana: "Asia/Jerusalem",    name: "イスラエル" },                                          // UTC+2
      { iana: "Asia/Baghdad",      name: "イラク" },                                              // UTC+3
      { iana: "Asia/Kuwait",       name: "クウェート" },                                          // UTC+3
      { iana: "Asia/Riyadh",       name: "サウジアラビア" },                                      // UTC+3
      { iana: "Asia/Istanbul",     name: "トルコ" },                                              // UTC+3
      { iana: "Asia/Tehran",       name: "イラン" },                                              // UTC+3:30
      { iana: "Asia/Muscat",       name: "オマーン" },                                            // UTC+4
      { iana: "Asia/Dubai",        name: "UAE" },                                                 // UTC+4
      { iana: "Asia/Tashkent",     name: "ウズベキスタン" },                                      // UTC+5
      { iana: "Asia/Almaty",       name: "カザフスタン" },                                        // UTC+5
      { iana: "Asia/Karachi",      name: "パキスタン" },                                          // UTC+5
      { iana: "Asia/Kolkata",      name: "インド" },                                              // UTC+5:30
      { iana: "Asia/Colombo",      name: "スリランカ" },                                          // UTC+5:30
      { iana: "Asia/Kathmandu",    name: "ネパール" },                                            // UTC+5:45
      { iana: "Asia/Dhaka",        name: "バングラデシュ" },                                      // UTC+6
      { iana: "Asia/Yangon",       name: "ミャンマー" },                                          // UTC+6:30
      // インドネシアは3ゾーン。WIT(東部/UTC+9)は主要渡航先なしで省略。
      { iana: "Asia/Jakarta",      name: "インドネシア西部", sub: "ジャカルタ" },                  // UTC+7
      { iana: "Asia/Phnom_Penh",   name: "カンボジア" },                                          // UTC+7
      { iana: "Asia/Bangkok",      name: "タイ" },                                                // UTC+7
      { iana: "Asia/Ho_Chi_Minh",  name: "ベトナム" },                                            // UTC+7
      { iana: "Asia/Makassar",     name: "インドネシア中部", sub: "バリ・マカッサル" },            // UTC+8
      { iana: "Asia/Singapore",    name: "シンガポール" },                                        // UTC+8
      { iana: "Asia/Taipei",       name: "台湾" },                                                // UTC+8
      { iana: "Asia/Shanghai",     name: "中国" },                                                // UTC+8
      { iana: "Asia/Manila",       name: "フィリピン" },                                          // UTC+8
      { iana: "Asia/Hong_Kong",    name: "香港" },                                                // UTC+8
      { iana: "Asia/Kuala_Lumpur", name: "マレーシア" },                                          // UTC+8
      { iana: "Asia/Seoul",        name: "韓国" },                                                // UTC+9
      { iana: "Asia/Tokyo",        name: "日本" },                                                // UTC+9
      { iana: "Asia/Vladivostok",  name: "ロシア極東", sub: "ウラジオストク・ハバロフスク" },      // UTC+10
    ],
  },
  {
    label: "太平洋・オセアニア",
    zones: [
      { iana: "Pacific/Tahiti",     name: "タヒチ" },                                             // UTC-10
      { iana: "Indian/Maldives",    name: "モルディブ" },                                         // UTC+5
      { iana: "Australia/Perth",    name: "西オーストラリア", sub: "パース（UTC+8）" },            // UTC+8
      { iana: "Australia/Adelaide", name: "南オーストラリア", sub: "アデレード（UTC+9:30）" },     // UTC+9:30
      // Sydney と Melbourne はDSTルールが同一 → 1エントリに統合
      { iana: "Australia/Sydney",   name: "オーストラリア東部", sub: "シドニー・メルボルン・キャンベラ（夏時間あり）" }, // UTC+10
      // Brisbane は東部と同オフセットだが夏時間なし → 別ゾーン
      { iana: "Australia/Brisbane", name: "クイーンズランド", sub: "ブリスベン（夏時間なし）" },   // UTC+10
      { iana: "Pacific/Guam",       name: "グアム" },                                             // UTC+10
      { iana: "Pacific/Auckland",   name: "ニュージーランド" },                                   // UTC+12
      { iana: "Pacific/Fiji",       name: "フィジー" },                                           // UTC+12
    ],
  },
  {
    label: "ヨーロッパ",
    zones: [
      { iana: "Europe/Dublin",     name: "アイルランド" },                                        // UTC+0
      { iana: "Europe/London",     name: "イギリス" },                                            // UTC+0
      { iana: "Europe/Lisbon",     name: "ポルトガル" },                                          // UTC+0
      { iana: "Europe/Rome",       name: "イタリア" },                                            // UTC+1
      { iana: "Europe/Vienna",     name: "オーストリア" },                                        // UTC+1
      { iana: "Europe/Amsterdam",  name: "オランダ" },                                            // UTC+1
      // Europe/Belgrade は BA,HR,ME,MK,RS,SI をカバーする多国ゾーン。
      // セルビアを代表エントリに、主要渡航先クロアチアは別エントリで追加（同じゾーンの alias）。
      { iana: "Europe/Zagreb",     name: "クロアチア" },                                          // UTC+1
      { iana: "Europe/Zurich",     name: "スイス" },                                              // UTC+1
      { iana: "Europe/Stockholm",  name: "スウェーデン" },                                        // UTC+1
      { iana: "Europe/Madrid",     name: "スペイン" },                                            // UTC+1
      { iana: "Europe/Belgrade",   name: "セルビア" },                                            // UTC+1
      { iana: "Europe/Prague",     name: "チェコ" },                                              // UTC+1
      { iana: "Europe/Copenhagen", name: "デンマーク" },                                          // UTC+1
      { iana: "Europe/Berlin",     name: "ドイツ" },                                              // UTC+1
      { iana: "Europe/Oslo",       name: "ノルウェー" },                                          // UTC+1
      { iana: "Europe/Budapest",   name: "ハンガリー" },                                          // UTC+1
      { iana: "Europe/Paris",      name: "フランス" },                                            // UTC+1
      { iana: "Europe/Brussels",   name: "ベルギー" },                                            // UTC+1
      { iana: "Europe/Warsaw",     name: "ポーランド" },                                          // UTC+1
      { iana: "Europe/Kyiv",       name: "ウクライナ" },                                          // UTC+2
      { iana: "Europe/Athens",     name: "ギリシャ" },                                            // UTC+2
      { iana: "Europe/Helsinki",   name: "フィンランド" },                                        // UTC+2
      { iana: "Europe/Bucharest",  name: "ルーマニア" },                                          // UTC+2
      { iana: "Europe/Moscow",     name: "ロシア西部", sub: "モスクワ・サンクトペテルブルク" },    // UTC+3
    ],
  },
  {
    label: "アメリカ",
    zones: [
      { iana: "Pacific/Honolulu",               name: "ハワイ" },                                 // UTC-10
      { iana: "America/Anchorage",              name: "アラスカ" },                               // UTC-9
      { iana: "America/Los_Angeles",            name: "太平洋時間", sub: "ロサンゼルス・サンフランシスコ・シアトル・バンクーバー" }, // UTC-8
      { iana: "America/Phoenix",                name: "アリゾナ", sub: "フェニックス（サマータイムなし）" }, // UTC-7
      { iana: "America/Denver",                 name: "山岳部時間", sub: "デンバー・ソルトレイクシティ・カルガリー" }, // UTC-7
      // メキシコは複数ゾーン → ゾーン名
      { iana: "America/Chicago",                name: "中部時間", sub: "シカゴ・ダラス・ヒューストン・ニューオーリンズ" }, // UTC-6
      { iana: "America/Mexico_City",            name: "メキシコ中部", sub: "メキシコシティ・グアダラハラ・モンテレイ" }, // UTC-6
      { iana: "America/Bogota",                 name: "コロンビア" },                             // UTC-5
      { iana: "America/New_York",               name: "東部時間", sub: "ニューヨーク・ボストン・マイアミ・アトランタ・トロント" }, // UTC-5
      { iana: "America/Lima",                   name: "ペルー" },                                 // UTC-5
      { iana: "America/Cancun",                 name: "メキシコ東部", sub: "カンクン（サマータイムなし）" }, // UTC-5
      { iana: "America/Santiago",               name: "チリ" },                                   // UTC-4
      { iana: "America/Argentina/Buenos_Aires", name: "アルゼンチン" },                           // UTC-3
      // ブラジルは複数ゾーン → ゾーン名
      { iana: "America/Sao_Paulo",              name: "ブラジル東部", sub: "サンパウロ・リオデジャネイロ" }, // UTC-3
      { iana: "Atlantic/Reykjavik",             name: "アイスランド" },                           // UTC+0
    ],
  },
  {
    label: "アフリカ・中東",
    zones: [
      // 複数国ゾーン → ゾーン名
      { iana: "Africa/Algiers",      name: "アルジェリア" },                                      // UTC+1
      { iana: "Africa/Tunis",        name: "チュニジア" },                                        // UTC+1
      { iana: "Africa/Lagos",        name: "西アフリカ", sub: "ラゴス・ドゥアラ・ルアンダ" },     // UTC+1
      { iana: "Africa/Casablanca",   name: "モロッコ" },                                          // UTC+1
      { iana: "Africa/Cairo",        name: "エジプト" },                                          // UTC+2
      { iana: "Africa/Johannesburg", name: "南アフリカ" },                                        // UTC+2
      { iana: "Africa/Khartoum",     name: "スーダン" },                                          // UTC+3
      // Africa/Addis_Ababa は Nairobi の別名なので統合
      { iana: "Africa/Nairobi",      name: "東アフリカ", sub: "ナイロビ・ダルエスサラーム・アジスアベバ・カンパラ" }, // UTC+3
    ],
  },
];

const ALL_TZ_MAP = new Map(
  TZ_GROUPS.flatMap((g) => g.zones.map((z) => [z.iana, z])),
);

export function TimezonePicker({
  name,
  value,
  onChange,
}: {
  name?: string;
  value: string;
  onChange: (iana: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [groupLabel, setGroupLabel] = useState<string | null>(null);

  const group = TZ_GROUPS.find((g) => g.label === groupLabel) ?? null;
  const label = tzDisplayLabel(value);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setGroupLabel(null);
  };

  return (
    <>
      {name && <input type="hidden" name={name} value={value} />}
      <Popover.Root open={open} onOpenChange={handleOpenChange} modal={false}>
        <Popover.Trigger
          type="button"
          className={`flex w-full items-center justify-between gap-2 text-left ${inputClass} group`}
        >
          <span className="min-w-0 flex-1 truncate">{label}</span>
          <ChevronIcon
            size={16}
            className="shrink-0 rotate-90 text-subtle-foreground transition group-aria-expanded:rotate-[-90deg]"
          />
        </Popover.Trigger>

        <Popover.Portal>
          <Popover.Positioner sideOffset={4} className="z-50">
            <Popover.Popup className="max-h-64 w-[var(--anchor-width)] min-w-[22rem] overflow-y-auto rounded-md border border-foreground/20 bg-background py-1 shadow-lg outline-none">
              {!group ? (
                // Step 1: 大陸グループ一覧
                TZ_GROUPS.map((g) => (
                  <button
                    key={g.label}
                    type="button"
                    onClick={() => setGroupLabel(g.label)}
                    className={`flex items-center justify-between gap-2 ${menuItemClass}`}
                  >
                    <span>{g.label}</span>
                    <ChevronIcon
                      size={16}
                      className="shrink-0 rotate-90 text-subtle-foreground"
                    />
                  </button>
                ))
              ) : (
                // Step 2: 選択した大陸の都市一覧
                <>
                  <button
                    type="button"
                    onClick={() => setGroupLabel(null)}
                    className={`flex items-center gap-2 border-b border-foreground/10 font-medium ${menuItemClass}`}
                  >
                    <ChevronIcon
                      size={16}
                      className="-rotate-90 text-muted-foreground"
                    />
                    <span>{group.label}</span>
                  </button>
                  {group.zones.map((zone) => (
                    <button
                      key={zone.iana}
                      type="button"
                      onClick={() => {
                        onChange(zone.iana);
                        setOpen(false);
                      }}
                      className={`flex items-center justify-between gap-2 ${menuItemClass} ${
                        zone.iana === value ? "bg-accent font-medium" : ""
                      }`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{zone.name}</span>
                        {zone.sub && (
                          <span className="block truncate text-xs font-normal text-muted-foreground">
                            {zone.sub}
                          </span>
                        )}
                      </span>
                      {zone.iana === value && (
                        <CheckIcon
                          size={16}
                          className="shrink-0 text-muted-foreground"
                        />
                      )}
                    </button>
                  ))}
                </>
              )}
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </>
  );
}
