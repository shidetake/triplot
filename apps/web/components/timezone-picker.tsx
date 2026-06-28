"use client";

import { useTranslations } from "next-intl";

import { inputClass } from "./input-class";

// IANA → カタログキー変換（"Asia/Hong_Kong" → "asia_hong_kong"）。
function ianaToKey(iana: string): string {
  return iana.replace(/\//g, "_").replace(/-/g, "_").toLowerCase();
}

// IANA 末尾の都市名（"Asia/Ho_Chi_Minh" → "Ho Chi Minh"）。
function cityOf(iana: string): string {
  return iana.split("/").pop()?.replace(/_/g, " ") ?? iana;
}

// 表示ラベルを解決するフック。カタログにあれば翻訳名、なければ都市名。
export function useTzLabel(): (iana: string) => string {
  const t = useTranslations("timezone");
  return (iana: string) => {
    const key = ianaToKey(iana);
    try {
      return t(key as Parameters<typeof t>[0]);
    } catch {
      return cityOf(iana);
    }
  };
}

// フック不要の文脈向け（event-form の既存パターン等）。
export function tzDisplayLabel(iana: string): string {
  return cityOf(iana);
}

// 旅行でよく使う TZ を大陸別にグループ化したキュレーション済みリスト。
// 検索なし・native select でスクロールして選ぶ（iOS 標準と同じ操作）。
const TZ_GROUPS: Array<{ label: string; zones: string[] }> = [
  {
    label: "アジア",
    zones: [
      "Asia/Tokyo",
      "Asia/Seoul",
      "Asia/Shanghai",
      "Asia/Hong_Kong",
      "Asia/Taipei",
      "Asia/Singapore",
      "Asia/Kuala_Lumpur",
      "Asia/Bangkok",
      "Asia/Jakarta",
      "Asia/Manila",
      "Asia/Ho_Chi_Minh",
      "Asia/Phnom_Penh",
      "Asia/Yangon",
      "Asia/Kolkata",
      "Asia/Kathmandu",
      "Asia/Dhaka",
      "Asia/Colombo",
      "Asia/Karachi",
      "Asia/Dubai",
      "Asia/Riyadh",
      "Asia/Jerusalem",
      "Asia/Istanbul",
      "Asia/Tehran",
    ],
  },
  {
    label: "太平洋・オセアニア",
    zones: [
      "Pacific/Honolulu",
      "Pacific/Guam",
      "Pacific/Tahiti",
      "Pacific/Fiji",
      "Pacific/Auckland",
      "Australia/Sydney",
      "Australia/Melbourne",
      "Australia/Brisbane",
      "Australia/Adelaide",
      "Australia/Perth",
    ],
  },
  {
    label: "ヨーロッパ",
    zones: [
      "Europe/London",
      "Europe/Dublin",
      "Europe/Lisbon",
      "Europe/Paris",
      "Europe/Amsterdam",
      "Europe/Brussels",
      "Europe/Madrid",
      "Europe/Rome",
      "Europe/Berlin",
      "Europe/Zurich",
      "Europe/Vienna",
      "Europe/Stockholm",
      "Europe/Oslo",
      "Europe/Copenhagen",
      "Europe/Helsinki",
      "Europe/Warsaw",
      "Europe/Prague",
      "Europe/Budapest",
      "Europe/Bucharest",
      "Europe/Athens",
      "Europe/Moscow",
    ],
  },
  {
    label: "アメリカ",
    zones: [
      "America/New_York",
      "America/Chicago",
      "America/Denver",
      "America/Phoenix",
      "America/Los_Angeles",
      "America/Anchorage",
      "America/Toronto",
      "America/Vancouver",
      "America/Mexico_City",
      "America/Cancun",
      "America/Bogota",
      "America/Lima",
      "America/Santiago",
      "America/Sao_Paulo",
      "America/Buenos_Aires",
      "Atlantic/Reykjavik",
    ],
  },
  {
    label: "アフリカ・中東",
    zones: [
      "Africa/Cairo",
      "Africa/Nairobi",
      "Africa/Lagos",
      "Africa/Johannesburg",
      "Africa/Casablanca",
      "Africa/Addis_Ababa",
    ],
  },
];

// タイムゾーンを大陸別グループの native select で選ぶ。
// フォームの hidden input で name を渡す場合は name を指定。
// disclosure 等、外側が送る場合は name を省略して onChange だけ使う。
export function TimezonePicker({
  value,
  onChange,
  name,
}: {
  value: string;
  onChange: (iana: string) => void;
  name?: string;
}) {
  const tzLabel = useTzLabel();

  // 選択中の値がリストにない場合でも表示できるよう、現在値を先頭に追加する。
  const allIanas = TZ_GROUPS.flatMap((g) => g.zones);
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
        <option value={value}>{tzDisplayLabel(value)}</option>
      )}
      {TZ_GROUPS.map((group) => (
        <optgroup key={group.label} label={group.label}>
          {group.zones.map((iana) => (
            <option key={iana} value={iana}>
              {tzLabel(iana)}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
