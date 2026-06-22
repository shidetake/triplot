"use client";

import { useMemo, useState } from "react";

import { Combobox } from "@base-ui/react/combobox";

import { inputClass } from "./input-class";
import { menuItemClass } from "./menu-item";

// 旅行でよく使うTZの短いリスト（検索が空のとき＝既定で出す候補）。label は日本語の
// 通称のみ（IANA は値=value 側に持つ）。expense-form の tz 表示でも使う。
export const COMMON_TIMEZONES: { value: string; label: string }[] = [
  { value: "Asia/Tokyo", label: "日本" },
  { value: "Pacific/Honolulu", label: "ハワイ" },
  { value: "America/Los_Angeles", label: "米国西海岸" },
  { value: "America/New_York", label: "米国東海岸" },
  { value: "Europe/London", label: "イギリス" },
  { value: "Europe/Paris", label: "中央欧州" },
  { value: "Asia/Bangkok", label: "タイ" },
  { value: "Asia/Seoul", label: "韓国" },
  { value: "Asia/Singapore", label: "シンガポール" },
  { value: "Asia/Taipei", label: "台湾" },
  { value: "Asia/Shanghai", label: "中国" },
  { value: "Asia/Hong_Kong", label: "香港" },
  { value: "Australia/Sydney", label: "シドニー" },
  { value: "Pacific/Guam", label: "グアム" },
];

const FRIENDLY = new Map(COMMON_TIMEZONES.map((z) => [z.value, z.label]));

// 全IANAタイムゾーン（モダンブラウザ/Node）。取れない環境は common にフォールバック。
const ALL_ZONES: string[] = (() => {
  const sof = (Intl as { supportedValuesOf?: (k: string) => string[] })
    .supportedValuesOf;
  try {
    return sof ? sof("timeZone") : COMMON_TIMEZONES.map((z) => z.value);
  } catch {
    return COMMON_TIMEZONES.map((z) => z.value);
  }
})();

// IANA 末尾の都市名（"Asia/Ho_Chi_Minh" → "Ho Chi Minh"）。
function cityOf(iana: string): string {
  return iana.split("/").pop()?.replace(/_/g, " ") ?? iana;
}

// 表示名: 主要TZは日本語通称、それ以外は IANA の都市名。
export function tzDisplayLabel(iana: string): string {
  return FRIENDLY.get(iana) ?? cityOf(iana);
}

type TzRow = { iana: string; label: string };

const MAX_RESULTS = 60;

// 都市/地域名で検索して全IANAタイムゾーンから選ぶピッカー（iOS/Google カレンダー方式）。
// 表示は日本語通称か都市名・値は IANA 文字列。候補リストには IANA も併記（選択の手がかり
// ＋技術識別子を見たい人向け）だが、選択後のトリガ表示は短い通称だけ。
// 検索が空のときは主要TZ（COMMON）だけ出し、打ち始めると全ゾーンを検索する。
// name を渡すと hidden input で IANA を送る（disclosure 等で外側が送る場合は省略）。
export function TimezonePicker({
  value,
  onChange,
  name,
  placeholder,
}: {
  value: string; // IANA
  onChange: (iana: string) => void;
  name?: string;
  placeholder?: string;
}) {
  const [query, setQuery] = useState(tzDisplayLabel(value));

  const rows = useMemo<TzRow[]>(() => {
    const q = query.trim().toLowerCase();
    const selectedLabel = tzDisplayLabel(value).toLowerCase();
    // 未入力 or 選択値そのまま＝検索していない → 主要TZを既定表示
    if (q === "" || q === selectedLabel) {
      return COMMON_TIMEZONES.map((z) => ({ iana: z.value, label: z.label }));
    }
    const out: TzRow[] = [];
    for (const iana of ALL_ZONES) {
      const label = tzDisplayLabel(iana);
      if (
        label.toLowerCase().includes(q) ||
        iana.toLowerCase().includes(q) ||
        cityOf(iana).toLowerCase().includes(q)
      ) {
        out.push({ iana, label });
        if (out.length >= MAX_RESULTS) break;
      }
    }
    return out;
  }, [query, value]);

  return (
    <>
      {name && <input type="hidden" name={name} value={value} />}
      <Combobox.Root
        items={rows}
        filter={null}
        itemToStringLabel={(r: TzRow) => r.label}
        inputValue={query}
        onInputValueChange={(v, details) => {
          if (details.reason === "input-change") setQuery(v);
        }}
        onValueChange={(r) => {
          if (r) {
            const row = r as TzRow;
            onChange(row.iana);
            setQuery(row.label);
          }
        }}
      >
        <Combobox.Input
          placeholder={placeholder}
          autoComplete="off"
          className={`block w-full min-w-0 ${inputClass}`}
        />
        <Combobox.Portal>
          {/* z-[60]: 予定フォーム＝FormPopover(ポップオーバー/シート z-50) の中に置かれるので
              候補は器より上に出す（place-picker と同じ理由）。 */}
          <Combobox.Positioner sideOffset={4} className="z-[60]">
            {/* 2列の狭い入力にアンカーしても候補が読めるよう、アンカー幅を下限に内容で広げる
                （都市名＋IANA が折り返さない程度に。器の外には出ない上限を付ける）。 */}
            <Combobox.Popup className="max-h-64 w-max min-w-[var(--anchor-width)] max-w-[16rem] overflow-y-auto rounded-md border border-foreground/10 bg-white shadow-lg">
              <Combobox.List>
                {(row: TzRow) => (
                  <Combobox.Item
                    key={row.iana}
                    value={row}
                    className={`block ${menuItemClass} data-[highlighted]:bg-foreground/10`}
                  >
                    <span className="font-medium">{row.label}</span>
                    <span className="ml-2 text-xs text-subtle-foreground">
                      {row.iana}
                    </span>
                  </Combobox.Item>
                )}
              </Combobox.List>
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </Combobox.Root>
    </>
  );
}
