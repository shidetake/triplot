"use client";

import { useState } from "react";
import { format } from "date-fns";
import { ja, enUS } from "date-fns/locale";
import type { Matcher } from "react-day-picker";
import { useLocale, useTranslations } from "next-intl";

import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { formatYmd, parseYmd } from "@triplot/shared/ymd";

import { inputClass } from "./input-class";
import { TimeSelect } from "./time-select";

// 年プルダウンのナビ範囲（DatePopover と揃える）。今日から±10年。
const TODAY = new Date();
const RANGE_START = new Date(TODAY.getFullYear() - 10, 0, 1);
const RANGE_END = new Date(TODAY.getFullYear() + 10, 11, 1);

// 日付＋時刻を 1 つの結合エディタ（カレンダー＋時刻入力）で編集する。トリガは要約表示で、
// タップでポップオーバーが開く。開始/終了は同じエディタを共有し、トリガの見た目だけ
// variant で変える（開始＝日付＋時刻、終了＝時刻＋別日なら「+N日」）。iOS/Google カレンダーの
// コンパクト日時編集と同じ考え。送信値は親が hidden input で流す（この部品は controlled UI）。
export function DateTimePopover({
  date,
  time,
  onChange,
  variant,
  baseDate,
  tripStart,
  tripEnd,
  disabled,
  label,
}: {
  date: string; // "YYYY-MM-DD"
  time: string; // "HH:MM"
  // 日付・時刻どちらの変更も (date, time) のペアで通知する（親がガードを掛ける）。
  onChange: (date: string, time: string) => void;
  variant: "start" | "end";
  // end のとき: 開始日。トリガの「+N日」算出に使う。
  baseDate?: string;
  tripStart?: string | null;
  tripEnd?: string | null;
  disabled?: Matcher | Matcher[];
  label?: string;
}) {
  const t = useTranslations("common");
  const locale = useLocale();
  const dateFnsLocale = locale === "ja" ? ja : enUS;

  const [open, setOpen] = useState(false);
  const d = parseYmd(date);
  const tripFrom = parseYmd(tripStart);
  const tripTo = parseYmd(tripEnd);

  // 終了が開始より後の「日」のときだけ +N日。
  const dayDelta =
    variant === "end" && baseDate && date
      ? Math.round(
          ((parseYmd(date)?.getTime() ?? 0) -
            (parseYmd(baseDate)?.getTime() ?? 0)) /
            86_400_000,
        )
      : 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={label}
        className={cn(
          "flex w-auto min-w-0 shrink-0 items-center gap-1.5",
          inputClass,
        )}
      >
        {variant === "start" ? (
          <span className={d ? "text-foreground" : "text-subtle-foreground"}>
            {d ? `${format(d, "M/d (EEE)", { locale: dateFnsLocale })} ${time}` : t("selectDateTime")}
          </span>
        ) : (
          <span className="flex items-center gap-1">
            <span className="text-foreground">{time}</span>
            {dayDelta !== 0 && (
              <span className="rounded bg-blue-50 px-1 text-[10px] font-medium text-blue-600">
                {dayDelta > 0 ? `+${dayDelta}` : dayDelta}{t("dayLabel")}
              </span>
            )}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        {/* 年月日→時分の自然な順で、カレンダーが上・時刻が下。 */}
        <Calendar
          mode="single"
          selected={d}
          // 日付を選んでもポップオーバーは閉じない（続けて時刻も調整できるように。
          // 閉じるのは外側クリック / Esc）。
          onSelect={(nd) => nd && onChange(formatYmd(nd), time)}
          defaultMonth={d ?? tripFrom ?? new Date()}
          locale={dateFnsLocale}
          captionLayout="dropdown-years"
          startMonth={RANGE_START}
          endMonth={RANGE_END}
          disabled={disabled}
          modifiers={
            tripFrom && tripTo
              ? { trip: { from: tripFrom, to: tripTo } }
              : undefined
          }
          modifiersClassNames={{ trip: "bg-blue-50" }}
        />
        <div className="flex items-center gap-2 border-t border-foreground/10 p-3">
          <span className="text-sm text-muted-foreground">{t("timeLabel")}</span>
          <TimeSelect value={time} onChange={(v) => onChange(date, v)} />
        </div>
      </PopoverContent>
    </Popover>
  );
}
