"use client";

import { useState } from "react";

import { Popover } from "@base-ui/react/popover";

import { CheckIcon, ChevronIcon } from "./icons";
import { inputClass } from "./input-class";
import { menuItemClass } from "./menu-item";

// IANA 末尾の都市名（リストにない値のフォールバック用）。
function cityOf(iana: string): string {
  return iana.split("/").pop()?.replace(/_/g, " ") ?? iana;
}

export function tzDisplayLabel(iana: string): string {
  return ALL_TZ_MAP.get(iana)?.name ?? cityOf(iana);
}

export function useTzLabel(): (iana: string) => string {
  return (iana: string) => ALL_TZ_MAP.get(iana)?.name ?? cityOf(iana);
}

// 旅行でよく使うタイムゾーンを大陸別にキュレーション。
// 選択基準: IANA zone1970.tab（権威ある一覧）から国際的に重要な都市/地域をカバー。
const TZ_GROUPS: Array<{
  label: string;
  zones: Array<{ iana: string; name: string }>;
}> = [
  {
    label: "アジア",
    zones: [
      { iana: "Asia/Tokyo", name: "日本" },
      { iana: "Asia/Seoul", name: "韓国" },
      { iana: "Asia/Shanghai", name: "中国（上海）" },
      { iana: "Asia/Hong_Kong", name: "香港" },
      { iana: "Asia/Taipei", name: "台北" },
      { iana: "Asia/Singapore", name: "シンガポール" },
      { iana: "Asia/Kuala_Lumpur", name: "クアラルンプール" },
      { iana: "Asia/Bangkok", name: "バンコク" },
      { iana: "Asia/Jakarta", name: "ジャカルタ" },
      { iana: "Asia/Manila", name: "マニラ" },
      { iana: "Asia/Ho_Chi_Minh", name: "ホーチミン" },
      { iana: "Asia/Phnom_Penh", name: "プノンペン" },
      { iana: "Asia/Yangon", name: "ヤンゴン" },
      { iana: "Asia/Kolkata", name: "コルカタ（インド）" },
      { iana: "Asia/Kathmandu", name: "カトマンズ" },
      { iana: "Asia/Dhaka", name: "ダッカ" },
      { iana: "Asia/Colombo", name: "コロンボ" },
      { iana: "Asia/Karachi", name: "カラチ" },
      { iana: "Asia/Dubai", name: "ドバイ" },
      { iana: "Asia/Riyadh", name: "リヤド" },
      { iana: "Asia/Jerusalem", name: "エルサレム" },
      { iana: "Asia/Istanbul", name: "イスタンブール" },
      { iana: "Asia/Tehran", name: "テヘラン" },
      { iana: "Asia/Baghdad", name: "バグダッド" },
      { iana: "Asia/Tashkent", name: "タシュケント" },
      { iana: "Asia/Almaty", name: "アルマティ" },
    ],
  },
  {
    label: "太平洋・オセアニア",
    zones: [
      { iana: "Pacific/Honolulu", name: "ホノルル" },
      { iana: "Pacific/Guam", name: "グアム" },
      { iana: "Pacific/Tahiti", name: "タヒチ" },
      { iana: "Pacific/Fiji", name: "フィジー" },
      { iana: "Pacific/Auckland", name: "オークランド" },
      { iana: "Australia/Sydney", name: "シドニー" },
      { iana: "Australia/Melbourne", name: "メルボルン" },
      { iana: "Australia/Brisbane", name: "ブリスベン" },
      { iana: "Australia/Adelaide", name: "アデレード" },
      { iana: "Australia/Perth", name: "パース" },
      { iana: "Indian/Maldives", name: "モルディブ" },
    ],
  },
  {
    label: "ヨーロッパ",
    zones: [
      { iana: "Europe/London", name: "ロンドン" },
      { iana: "Europe/Dublin", name: "ダブリン" },
      { iana: "Europe/Lisbon", name: "リスボン" },
      { iana: "Europe/Paris", name: "パリ" },
      { iana: "Europe/Amsterdam", name: "アムステルダム" },
      { iana: "Europe/Brussels", name: "ブリュッセル" },
      { iana: "Europe/Madrid", name: "マドリード" },
      { iana: "Europe/Rome", name: "ローマ" },
      { iana: "Europe/Berlin", name: "ベルリン" },
      { iana: "Europe/Zurich", name: "チューリッヒ" },
      { iana: "Europe/Vienna", name: "ウィーン" },
      { iana: "Europe/Stockholm", name: "ストックホルム" },
      { iana: "Europe/Oslo", name: "オスロ" },
      { iana: "Europe/Copenhagen", name: "コペンハーゲン" },
      { iana: "Europe/Helsinki", name: "ヘルシンキ" },
      { iana: "Europe/Warsaw", name: "ワルシャワ" },
      { iana: "Europe/Prague", name: "プラハ" },
      { iana: "Europe/Budapest", name: "ブダペスト" },
      { iana: "Europe/Bucharest", name: "ブカレスト" },
      { iana: "Europe/Athens", name: "アテネ" },
      { iana: "Europe/Kyiv", name: "キーウ" },
      { iana: "Europe/Belgrade", name: "ベオグラード" },
      { iana: "Europe/Moscow", name: "モスクワ" },
    ],
  },
  {
    label: "アメリカ",
    zones: [
      { iana: "America/New_York", name: "ニューヨーク" },
      { iana: "America/Chicago", name: "シカゴ" },
      { iana: "America/Denver", name: "デンバー" },
      { iana: "America/Phoenix", name: "フェニックス" },
      { iana: "America/Los_Angeles", name: "ロサンゼルス" },
      { iana: "America/Anchorage", name: "アンカレッジ" },
      { iana: "America/Toronto", name: "トロント" },
      { iana: "America/Vancouver", name: "バンクーバー" },
      { iana: "America/Mexico_City", name: "メキシコシティ" },
      { iana: "America/Cancun", name: "カンクン" },
      { iana: "America/Bogota", name: "ボゴタ" },
      { iana: "America/Lima", name: "リマ" },
      { iana: "America/Santiago", name: "サンティアゴ" },
      { iana: "America/Sao_Paulo", name: "サンパウロ" },
      { iana: "America/Argentina/Buenos_Aires", name: "ブエノスアイレス" },
      { iana: "Atlantic/Reykjavik", name: "レイキャビク" },
    ],
  },
  {
    label: "アフリカ・中東",
    zones: [
      { iana: "Africa/Cairo", name: "カイロ" },
      { iana: "Africa/Nairobi", name: "ナイロビ" },
      { iana: "Africa/Lagos", name: "ラゴス" },
      { iana: "Africa/Johannesburg", name: "ヨハネスブルク" },
      { iana: "Africa/Casablanca", name: "カサブランカ" },
      { iana: "Africa/Addis_Ababa", name: "アジスアベバ" },
      { iana: "Africa/Khartoum", name: "ハルツーム" },
      { iana: "Africa/Tunis", name: "チュニス" },
      { iana: "Africa/Algiers", name: "アルジェ" },
    ],
  },
];

const ALL_TZ_MAP = new Map(
  TZ_GROUPS.flatMap((g) => g.zones.map((z) => [z.iana, z])),
);

// タイムゾーンを「大陸 → 都市」2段階ドリルダウンで選ぶ（1入力・Base UI Popover）。
// name を渡すとフォーム送信用の hidden input を出す（TzDisclosure はカスタム hidden を
// 持つため name を渡さない）。
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

  // 閉じたら大陸ビューに戻す（次に開いた時 Step1 から始まる）。
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
            <Popover.Popup className="max-h-64 w-[var(--anchor-width)] min-w-[12rem] overflow-y-auto rounded-md border border-foreground/20 bg-background py-1 shadow-lg outline-none">
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
                      <span>{zone.name}</span>
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
