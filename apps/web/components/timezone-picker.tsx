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

// name ルール:
//   1か国1ゾーン  → 国名（日本・フランス・インド）。subなし（「全土」なのに都市を並べると他の都市は？になる）
//   複数国1ゾーン → ゾーン/地域名（東アフリカ・西アフリカ）。subに主要都市
//   国内複数ゾーン → 地域/ゾーン名（東部時間・オーストラリア東部）。subに各都市
// 「時間」は省略可能な場合は省く。「東部時間」等は「東部」だけだと日本の地域と紛れるため残す。
const TZ_GROUPS: Array<{
  label: string;
  zones: Array<{ iana: string; name: string; sub?: string }>;
}> = [
  {
    label: "アジア",
    zones: [
      { iana: "Asia/Tokyo",        name: "日本" },
      { iana: "Asia/Seoul",        name: "韓国" },
      { iana: "Asia/Shanghai",     name: "中国" },
      { iana: "Asia/Hong_Kong",    name: "香港" },
      { iana: "Asia/Taipei",       name: "台北" },
      { iana: "Asia/Singapore",    name: "シンガポール" },
      { iana: "Asia/Kuala_Lumpur", name: "クアラルンプール" },
      { iana: "Asia/Bangkok",      name: "バンコク" },
      { iana: "Asia/Jakarta",      name: "ジャカルタ" },
      { iana: "Asia/Manila",       name: "マニラ" },
      { iana: "Asia/Ho_Chi_Minh",  name: "ホーチミン" },
      { iana: "Asia/Phnom_Penh",   name: "プノンペン" },
      { iana: "Asia/Yangon",       name: "ヤンゴン" },
      { iana: "Asia/Kolkata",      name: "インド" },
      { iana: "Asia/Kathmandu",    name: "カトマンズ" },
      { iana: "Asia/Dhaka",        name: "ダッカ" },
      { iana: "Asia/Colombo",      name: "コロンボ" },
      { iana: "Asia/Karachi",      name: "カラチ" },
      { iana: "Asia/Dubai",        name: "UAE" },
      { iana: "Asia/Muscat",       name: "オマーン" },
      { iana: "Asia/Riyadh",       name: "サウジアラビア" },
      { iana: "Asia/Kuwait",       name: "クウェート" },
      { iana: "Asia/Jerusalem",    name: "エルサレム" },
      { iana: "Asia/Istanbul",     name: "イスタンブール" },
      { iana: "Asia/Tehran",       name: "テヘラン" },
      { iana: "Asia/Baghdad",      name: "バグダッド" },
      { iana: "Asia/Tashkent",     name: "タシュケント" },
      { iana: "Asia/Almaty",       name: "アルマティ" },
      { iana: "Asia/Vladivostok",  name: "ロシア極東",  sub: "ウラジオストク・ハバロフスク" },
    ],
  },
  {
    label: "太平洋・オセアニア",
    zones: [
      { iana: "Pacific/Guam",       name: "グアム" },
      { iana: "Pacific/Tahiti",     name: "タヒチ" },
      { iana: "Pacific/Fiji",       name: "フィジー" },
      { iana: "Pacific/Auckland",   name: "ニュージーランド" },
      // Sydney と Melbourne はDSTルールが同一 → 1エントリに統合
      { iana: "Australia/Sydney",   name: "オーストラリア東部", sub: "シドニー・メルボルン・キャンベラ（夏時間あり）" },
      // Brisbane は東部と同オフセットだが夏時間なし → 別ゾーン
      { iana: "Australia/Brisbane", name: "クイーンズランド",   sub: "ブリスベン（夏時間なし）" },
      { iana: "Australia/Adelaide", name: "アデレード",         sub: "南オーストラリア州（UTC+9:30）" },
      { iana: "Australia/Perth",    name: "パース",             sub: "西オーストラリア州（UTC+8）" },
      { iana: "Indian/Maldives",    name: "モルディブ" },
    ],
  },
  {
    label: "ヨーロッパ",
    zones: [
      { iana: "Europe/London",     name: "イギリス" },
      { iana: "Europe/Dublin",     name: "ダブリン" },
      { iana: "Europe/Lisbon",     name: "リスボン" },
      { iana: "Europe/Paris",      name: "フランス" },
      { iana: "Europe/Amsterdam",  name: "アムステルダム" },
      { iana: "Europe/Brussels",   name: "ブリュッセル" },
      { iana: "Europe/Madrid",     name: "スペイン" },
      { iana: "Europe/Rome",       name: "イタリア" },
      { iana: "Europe/Berlin",     name: "ドイツ" },
      { iana: "Europe/Zurich",     name: "チューリッヒ" },
      { iana: "Europe/Vienna",     name: "ウィーン" },
      { iana: "Europe/Stockholm",  name: "ストックホルム" },
      { iana: "Europe/Oslo",       name: "オスロ" },
      { iana: "Europe/Copenhagen", name: "コペンハーゲン" },
      { iana: "Europe/Helsinki",   name: "ヘルシンキ" },
      { iana: "Europe/Warsaw",     name: "ワルシャワ" },
      { iana: "Europe/Prague",     name: "プラハ" },
      { iana: "Europe/Budapest",   name: "ブダペスト" },
      { iana: "Europe/Bucharest",  name: "ブカレスト" },
      { iana: "Europe/Athens",     name: "アテネ" },
      { iana: "Europe/Kyiv",       name: "キーウ" },
      { iana: "Europe/Belgrade",   name: "ベオグラード" },
      { iana: "Europe/Moscow",     name: "ロシア西部",  sub: "モスクワ・サンクトペテルブルク" },
    ],
  },
  {
    label: "アメリカ",
    zones: [
      // 米国本土は4ゾーン。「東部」だと日本の地域と紛れるため「東部時間」のまま。
      // カナダ東部・太平洋岸は米国と同じゾーンなのでサブに含める。
      { iana: "America/New_York",               name: "東部時間",   sub: "ニューヨーク・ボストン・マイアミ・アトランタ・トロント" },
      { iana: "America/Chicago",                name: "中部時間",   sub: "シカゴ・ダラス・ヒューストン・ニューオーリンズ" },
      { iana: "America/Denver",                 name: "山岳部時間", sub: "デンバー・ソルトレイクシティ・カルガリー" },
      { iana: "America/Phoenix",                name: "アリゾナ",   sub: "フェニックス（サマータイムなし）" },
      { iana: "America/Los_Angeles",            name: "太平洋時間", sub: "ロサンゼルス・サンフランシスコ・シアトル・バンクーバー" },
      { iana: "America/Anchorage",              name: "アラスカ" },
      { iana: "Pacific/Honolulu",               name: "ハワイ" },
      { iana: "America/Mexico_City",            name: "メキシコシティ", sub: "グアダラハラ・モンテレイ（メキシコ大部分）" },
      { iana: "America/Cancun",                 name: "カンクン",   sub: "カリブ側（サマータイムなし）" },
      { iana: "America/Bogota",                 name: "ボゴタ" },
      { iana: "America/Lima",                   name: "リマ" },
      { iana: "America/Santiago",               name: "サンティアゴ" },
      { iana: "America/Sao_Paulo",              name: "サンパウロ", sub: "リオデジャネイロ（南東ブラジル）" },
      { iana: "America/Argentina/Buenos_Aires", name: "ブエノスアイレス" },
      { iana: "Atlantic/Reykjavik",             name: "レイキャビク" },
    ],
  },
  {
    label: "アフリカ・中東",
    zones: [
      { iana: "Africa/Cairo",        name: "カイロ" },
      // 複数国ゾーン → ゾーン名。Africa/Addis_Ababa は Nairobi の別名なので統合。
      { iana: "Africa/Nairobi",      name: "東アフリカ", sub: "ナイロビ・ダルエスサラーム・アジスアベバ・カンパラ" },
      { iana: "Africa/Lagos",        name: "西アフリカ", sub: "ラゴス・ドゥアラ・ルアンダ" },
      { iana: "Africa/Johannesburg", name: "南アフリカ" },
      { iana: "Africa/Casablanca",   name: "カサブランカ" },
      { iana: "Africa/Khartoum",     name: "ハルツーム" },
      { iana: "Africa/Tunis",        name: "チュニス" },
      { iana: "Africa/Algiers",      name: "アルジェ" },
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
