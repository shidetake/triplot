"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import type { DateRange } from "react-day-picker";

import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// 年プルダウン（captionLayout="dropdown-years"）の選択肢範囲＝カレンダーの
// ＜ ＞ ナビが動ける範囲。今日から±10年。旅行プランの文脈では十分。
const TODAY = new Date();
const RANGE_START = new Date(TODAY.getFullYear() - 10, 0, 1);
const RANGE_END = new Date(TODAY.getFullYear() + 10, 11, 1);

function parseYmd(s?: string | null): Date | undefined {
  if (!s) return undefined;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
}
function fmtYmd(d?: Date): string {
  if (!d) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

// 範囲日付のポップオーバー。トリガーをタップ → カレンダーが popover で開き、
// 範囲（from, to）を選ぶ。両方選び終わると自動で閉じる。フォーム送信は2つの
// hidden input（startName / endName）に "YYYY-MM-DD" を流す。
// 旅行作成フォームの「日程」用。挙動は予定フォームの DatePopover と同方式。
export function DateRangePopover({
  startName,
  endName,
  defaultStart,
  defaultEnd,
  required,
  onChange,
}: {
  startName: string;
  endName: string;
  defaultStart?: string | null;
  defaultEnd?: string | null;
  required?: boolean;
  // 選択中の範囲（"YYYY-MM-DD" or null）を親に通知する。
  onChange?: (start: string | null, end: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<DateRange | undefined>(() => {
    const from = parseYmd(defaultStart);
    const to = parseYmd(defaultEnd);
    return from || to ? { from, to } : undefined;
  });

  const f = range?.from;
  const t = range?.to;

  useEffect(() => {
    onChange?.(fmtYmd(f) || null, fmtYmd(t) || null);
    // onChange は呼び出し側の inline 関数想定なので依存に入れない。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f, t]);
  const label =
    f && t
      ? `${format(f, "yyyy/M/d (EEE)", { locale: ja })} 〜 ${format(t, "M/d (EEE)", { locale: ja })}`
      : f
        ? `${format(f, "yyyy/M/d (EEE)", { locale: ja })} 〜 ?`
        : "";

  return (
    <>
      <input
        type="hidden"
        name={startName}
        value={fmtYmd(f)}
        required={required}
      />
      <input
        type="hidden"
        name={endName}
        value={fmtYmd(t)}
        required={required}
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          className={cn(
            "flex h-9 w-full min-w-0 items-center rounded-md border border-zinc-300 bg-white px-3 text-sm focus:border-primary focus:outline-none",
          )}
        >
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-left",
              f || t ? "text-foreground" : "text-subtle-foreground",
            )}
          >
            {label}
          </span>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="range"
            selected={range}
            onSelect={(newRange, triggerDate) => {
              // 範囲確定済みのときに次の日付がタップされたら「新しい開始日」
              // としてリセットする（Booking / Airbnb 風）。rdp デフォルトは
              // 端点を寄せる挙動だが、travel app では予測しにくい（範囲内
              // タップで片端が縮む等）ので採用しない。
              if (range?.from && range?.to) {
                setRange({ from: triggerDate, to: undefined });
              } else {
                setRange(newRange);
              }
            }}
            defaultMonth={range?.from ?? new Date()}
            locale={ja}
            // min=1 を渡すことで「初回クリックで from=to=d として確定扱い」になる
            // v10 既定の挙動を抑え、初回クリックは to=undefined にする。
            min={1}
            captionLayout="dropdown-years"
            startMonth={RANGE_START}
            endMonth={RANGE_END}
          />
          {/* 範囲選択は片端だけ押したつもりが両端確定になって popover が閉じる
              のがミスりやすいので、自動クローズはやめて、ここの「確定」を明示
              タップで閉じる方式にしている。両端揃うまで disabled。 */}
          <div className="flex justify-end border-t border-zinc-200 p-2">
            <button
              type="button"
              disabled={!f || !t}
              onClick={() => setOpen(false)}
              className="h-8 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-40"
            >
              確定
            </button>
          </div>
        </PopoverContent>
      </Popover>
    </>
  );
}
