"use client";

import { inputClass } from "./input-class";

// IANA 末尾の都市名（"Asia/Ho_Chi_Minh" → "Ho Chi Minh"）。
function cityOf(iana: string): string {
  return iana.split("/").pop()?.replace(/_/g, " ") ?? iana;
}

// フック不要の文脈向け（event-form の既存パターン等）。
export function tzDisplayLabel(iana: string): string {
  return cityOf(iana);
}

// フック形式の別名（後方互換）。ピッカー以外からの呼び出しはこちら。
export function useTzLabel(): (iana: string) => string {
  return (iana: string) => {
    const zone = ALL_TZ_MAP.get(iana);
    return zone?.name ?? cityOf(iana);
  };
}

// 旅行でよく使う TZ を大陸別にグループ化したキュレーション済みリスト。
// native select でスクロールして選ぶ（iOS 標準と同じ操作）。
const TZ_GROUPS: Array<{ label: string; zones: Array<{ iana: string; name: string }> }> = [
  {
    label: "アジア",
    zones: [
      { iana: "Asia/Tokyo",       name: "日本" },
      { iana: "Asia/Seoul",       name: "韓国" },
      { iana: "Asia/Shanghai",    name: "中国（上海）" },
      { iana: "Asia/Hong_Kong",   name: "香港" },
      { iana: "Asia/Taipei",      name: "台北" },
      { iana: "Asia/Singapore",   name: "シンガポール" },
      { iana: "Asia/Kuala_Lumpur",name: "クアラルンプール" },
      { iana: "Asia/Bangkok",     name: "バンコク" },
      { iana: "Asia/Jakarta",     name: "ジャカルタ" },
      { iana: "Asia/Manila",      name: "マニラ" },
      { iana: "Asia/Ho_Chi_Minh", name: "ホーチミン" },
      { iana: "Asia/Phnom_Penh",  name: "プノンペン" },
      { iana: "Asia/Yangon",      name: "ヤンゴン" },
      { iana: "Asia/Kolkata",     name: "コルカタ（インド）" },
      { iana: "Asia/Kathmandu",   name: "カトマンズ" },
      { iana: "Asia/Dhaka",       name: "ダッカ" },
      { iana: "Asia/Colombo",     name: "コロンボ" },
      { iana: "Asia/Karachi",     name: "カラチ" },
      { iana: "Asia/Dubai",       name: "ドバイ" },
      { iana: "Asia/Riyadh",      name: "リヤド" },
      { iana: "Asia/Jerusalem",   name: "エルサレム" },
      { iana: "Asia/Istanbul",    name: "イスタンブール" },
      { iana: "Asia/Tehran",      name: "テヘラン" },
    ],
  },
  {
    label: "太平洋・オセアニア",
    zones: [
      { iana: "Pacific/Honolulu",    name: "ホノルル" },
      { iana: "Pacific/Guam",        name: "グアム" },
      { iana: "Pacific/Tahiti",      name: "タヒチ" },
      { iana: "Pacific/Fiji",        name: "フィジー" },
      { iana: "Pacific/Auckland",    name: "オークランド" },
      { iana: "Australia/Sydney",    name: "シドニー" },
      { iana: "Australia/Melbourne", name: "メルボルン" },
      { iana: "Australia/Brisbane",  name: "ブリスベン" },
      { iana: "Australia/Adelaide",  name: "アデレード" },
      { iana: "Australia/Perth",     name: "パース" },
    ],
  },
  {
    label: "ヨーロッパ",
    zones: [
      { iana: "Europe/London",     name: "ロンドン" },
      { iana: "Europe/Dublin",     name: "ダブリン" },
      { iana: "Europe/Lisbon",     name: "リスボン" },
      { iana: "Europe/Paris",      name: "パリ" },
      { iana: "Europe/Amsterdam",  name: "アムステルダム" },
      { iana: "Europe/Brussels",   name: "ブリュッセル" },
      { iana: "Europe/Madrid",     name: "マドリード" },
      { iana: "Europe/Rome",       name: "ローマ" },
      { iana: "Europe/Berlin",     name: "ベルリン" },
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
      { iana: "Europe/Moscow",     name: "モスクワ" },
    ],
  },
  {
    label: "アメリカ",
    zones: [
      { iana: "America/New_York",    name: "ニューヨーク" },
      { iana: "America/Chicago",     name: "シカゴ" },
      { iana: "America/Denver",      name: "デンバー" },
      { iana: "America/Phoenix",     name: "フェニックス" },
      { iana: "America/Los_Angeles", name: "ロサンゼルス" },
      { iana: "America/Anchorage",   name: "アンカレッジ" },
      { iana: "America/Toronto",     name: "トロント" },
      { iana: "America/Vancouver",   name: "バンクーバー" },
      { iana: "America/Mexico_City", name: "メキシコシティ" },
      { iana: "America/Cancun",      name: "カンクン" },
      { iana: "America/Bogota",      name: "ボゴタ" },
      { iana: "America/Lima",        name: "リマ" },
      { iana: "America/Santiago",    name: "サンティアゴ" },
      { iana: "America/Sao_Paulo",   name: "サンパウロ" },
      { iana: "America/Buenos_Aires",name: "ブエノスアイレス" },
      { iana: "Atlantic/Reykjavik",  name: "レイキャビク" },
    ],
  },
  {
    label: "アフリカ・中東",
    zones: [
      { iana: "Africa/Cairo",         name: "カイロ" },
      { iana: "Africa/Nairobi",       name: "ナイロビ" },
      { iana: "Africa/Lagos",         name: "ラゴス" },
      { iana: "Africa/Johannesburg",  name: "ヨハネスブルク" },
      { iana: "Africa/Casablanca",    name: "カサブランカ" },
      { iana: "Africa/Addis_Ababa",   name: "アジスアベバ" },
    ],
  },
];

// iana → name の逆引きマップ（useTzLabel 用）。
const ALL_TZ_MAP = new Map(
  TZ_GROUPS.flatMap((g) => g.zones.map((z) => [z.iana, z]))
);

// タイムゾーンを大陸別グループの native select で選ぶ。
export function TimezonePicker({
  value,
  onChange,
  name,
}: {
  value: string;
  onChange: (iana: string) => void;
  name?: string;
}) {
  const allIanas = TZ_GROUPS.flatMap((g) => g.zones.map((z) => z.iana));
  const needsFallback = value && !allIanas.includes(value);

  return (
    <select
      name={name}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`block w-full min-w-0 ${inputClass}`}
    >
      {/* リストにない値（旧データ等）をフォールバック表示 */}
      {needsFallback && (
        <option value={value}>{cityOf(value)}</option>
      )}
      {TZ_GROUPS.map((group) => (
        <optgroup key={group.label} label={group.label}>
          {group.zones.map((zone) => (
            <option key={zone.iana} value={zone.iana}>
              {zone.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
