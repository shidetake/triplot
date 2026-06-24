"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { Combobox } from "@base-ui/react/combobox";

import { inputClass } from "./input-class";
import { menuItemClass } from "./menu-item";

// 旅行でよく使うTZのIANA値リスト（ラベルはカタログから引く）。
const COMMON_TZ_VALUES: string[] = [
  "Asia/Tokyo",
  "Pacific/Honolulu",
  "America/Los_Angeles",
  "America/New_York",
  "Europe/London",
  "Europe/Paris",
  "Asia/Bangkok",
  "Asia/Seoul",
  "Asia/Singapore",
  "Asia/Taipei",
  "Asia/Shanghai",
  "Asia/Hong_Kong",
  "Australia/Sydney",
  "Pacific/Guam",
];

// IANA → カタログキー変換（"Asia/Hong_Kong" → "asia_hong_kong"）。
function ianaToKey(iana: string): string {
  return iana.replace(/\//g, "_").replace(/-/g, "_").toLowerCase();
}

// IANA 末尾の都市名（"Asia/Ho_Chi_Minh" → "Ho Chi Minh"）。
function cityOf(iana: string): string {
  return iana.split("/").pop()?.replace(/_/g, " ") ?? iana;
}

// 全IANAタイムゾーン（モダンブラウザ/Node）。取れない環境は common にフォールバック。
const ALL_ZONES: string[] = (() => {
  const sof = (Intl as { supportedValuesOf?: (k: string) => string[] })
    .supportedValuesOf;
  try {
    return sof ? sof("timeZone") : COMMON_TZ_VALUES;
  } catch {
    return COMMON_TZ_VALUES;
  }
})();

// 表示ラベルを解決するフック。カタログにあれば翻訳名、なければ都市名。
export function useTzLabel(): (iana: string) => string {
  const t = useTranslations("timezone");
  return (iana: string) => {
    const key = ianaToKey(iana);
    // useTranslations は未知キーで例外を投げるため、known keys だけ引く。
    try {
      return t(key as Parameters<typeof t>[0]);
    } catch {
      return cityOf(iana);
    }
  };
}

// 後方互換: フック不要の文脈（expense-form の既存パターン）向けに残す。
// コンポーネント内では useTzLabel() を使うこと。
export function tzDisplayLabel(iana: string): string {
  return cityOf(iana);
}

type TzRow = { iana: string; label: string };

const MAX_RESULTS = 60;

// 都市/地域名で検索して全IANAタイムゾーンから選ぶピッカー（iOS/Google カレンダー方式）。
// 表示は翻訳通称か都市名・値は IANA 文字列。候補リストには IANA も併記（選択の手がかり
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
  const tzLabel = useTzLabel();
  const [query, setQuery] = useState(tzLabel(value));

  const rows = useMemo<TzRow[]>(() => {
    const q = query.trim().toLowerCase();
    const selectedLabel = tzLabel(value).toLowerCase();
    // 未入力 or 選択値そのまま＝検索していない → 主要TZを既定表示
    if (q === "" || q === selectedLabel) {
      return COMMON_TZ_VALUES.map((iana) => ({ iana, label: tzLabel(iana) }));
    }
    const out: TzRow[] = [];
    for (const iana of ALL_ZONES) {
      const label = tzLabel(iana);
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
  }, [query, value, tzLabel]);

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
