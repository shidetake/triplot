"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { type Airline, searchAirlines } from "@triplot/shared/airlines";
import { createFlightApi } from "@triplot/shared/data/flightApi";
import {
  durationMinutes,
  type Flight,
  isComplete,
  looksLikeAirlineQuery,
  parseFlightNumber,
} from "@triplot/shared/flight";
import {
  FLIGHT_SEARCH_DEBOUNCE_MS,
  lookupFlight,
  peekCachedFlight,
} from "@triplot/shared/flightLookup";
import { loadAirportNames, localizeFlightJa } from "@triplot/shared/flightLocalize";

import { createClient } from "@/lib/supabase/client";
import { CloseButton } from "./close-button";
import { inputClass } from "./input-class";
import { MessageBox } from "./message-box";
import { menuItemClass } from "./menu-item";

// フライト番号の入力。予定フォームのタイトル欄と**入れ替わる**（行を増やさない）。
// RN 版（apps/mobile/src/components/flight-picker.tsx）と同じ挙動・同じ共有ロジック。
//
// 1つの欄に何を打ってもよく、打った内容で分岐する。モードを分けると「航空会社から
// 探す」「番号を打つ」のどちらかを最初に選ぶ圧が生まれる。

export function FlightPicker({
  date,
  onCancel,
  onApply,
}: {
  /** 検索に使う出発日 "YYYY-MM-DD"（フォームの日時から渡る） */
  date: string;
  onCancel: () => void;
  onApply: (flight: Flight) => void;
}) {
  const t = useTranslations("event");
  const tCommon = useTranslations("common");
  const locale = useLocale();

  const [airline, setAirline] = useState<Airline | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Flight | null>(null);
  // 直近で解決済み（検索中の状態を抜けた）の "便名|日付" キー。busy を専用の
  // state にせず、これと今のキーの一致/不一致から導出する（effect 内で直接
  // setState すると react-hooks/set-state-in-effect に触れるため、派生値にする）。
  const [settledKey, setSettledKey] = useState<string | null>(null);

  // 打っている途中の古い応答が後から届いて上書きするのを防ぐ。
  const seq = useRef(0);
  // Enter/確定で debounce を待たず今すぐ引くための差し替え口（effect が
  // 都度差し替える。対象が崩れている間は no-op）。
  const runNowRef = useRef<() => void>(() => {});

  const typed = airline ? `${airline.iata}${text.trim()}` : text.trim();
  const parsed = parseFlightNumber(typed);
  const normalized = parsed?.normalized ?? null;
  const key = normalized !== null ? `${normalized}|${date}` : null;
  const suggestions =
    airline === null && looksLikeAirlineQuery(text) ? searchAirlines(text, 6) : [];

  // 「検索中」は便名が揃った時点ですぐ出すが（showBusy の導出を参照）、実際に
  // 提供元を叩くのは入力が止まってから（1文字ごとに叩くとレートリミットに
  // 引っかかる）。ただし全ユーザー横断のキャッシュだけは待たずに覗き、当たれば
  // 即表示する（キャッシュ照会は自前 DB を見るだけで提供元の枠を消費しない）。
  useEffect(() => {
    if (normalized === null) {
      runNowRef.current = () => {};
      return;
    }
    const currentKey = `${normalized}|${date}`;
    const my = ++seq.current;
    let fired = false;

    const applyFound = async (flight: Flight) => {
      // 提供元は英語名しか返さないので日本語に差し替える（対訳表は動的 import）。
      let localized = flight;
      try {
        const table = await loadAirportNames(locale);
        if (table) localized = localizeFlightJa(flight, table);
      } catch {
        // 日本語化に失敗しても便自体は出す。
      }
      if (my !== seq.current) return;
      setResult(localized);
      setError(null);
      setSettledKey(currentKey);
    };

    const runLookup = () => {
      if (fired) return;
      fired = true;
      clearTimeout(timer);
      void (async () => {
        try {
          const outcome = await lookupFlight(
            createFlightApi(createClient()),
            normalized,
            date,
          );
          if (my !== seq.current) return;
          if (outcome.kind === "found") {
            await applyFound(outcome.flight);
          } else {
            setResult(null);
            setError(
              outcome.kind === "unknown-number" ? t("flightNotFound") : t("flightNoData"),
            );
            setSettledKey(currentKey);
          }
        } catch {
          if (my !== seq.current) return;
          setResult(null);
          setError(t("flightFailed"));
          setSettledKey(currentKey);
        }
      })();
    };
    runNowRef.current = runLookup;

    void peekCachedFlight(createFlightApi(createClient()), normalized, date).then((flight) => {
      if (fired || my !== seq.current || !flight) return;
      fired = true;
      clearTimeout(timer);
      void applyFound(flight);
    });

    const timer = setTimeout(runLookup, FLIGHT_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [normalized, date, t, locale]);

  // 便名が崩れている間（消しかけ等）は前の結果を出さない。effect で state を
  // 消しに行かず、表示側で門番する。
  const showBusy = key !== null && settledKey !== key;
  const showError = key !== null && settledKey === key ? error : null;
  const showResult = normalized !== null && result?.number === normalized ? result : null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {airline && (
          <button
            type="button"
            onClick={() => {
              setAirline(null);
              setText("");
            }}
            className="h-9 shrink-0 rounded-md bg-foreground/5 px-3 text-sm font-medium"
            title={airline.name}
          >
            {airline.iata}
          </button>
        )}
        <div className="relative min-w-0 flex-1">
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") runNowRef.current();
            }}
            autoFocus
            autoComplete="off"
            placeholder={airline ? t("flightNumberPlaceholder") : t("flightPlaceholder")}
            aria-label={t("flightAria")}
            className={`${inputClass} block w-full pr-9 uppercase placeholder:normal-case`}
          />
          <CloseButton
            onClick={onCancel}
            label={tCommon("cancel")}
            className="absolute right-1.5 top-1/2 -translate-y-1/2"
          />
        </div>
      </div>

      {suggestions.length > 0 && (
        <ul className="max-h-64 overflow-y-auto rounded-md border border-foreground/10">
          {suggestions.map((a) => (
            <li key={a.iata}>
              <button
                type="button"
                onClick={() => {
                  setAirline(a);
                  setText("");
                }}
                className={`${menuItemClass} flex items-center gap-2`}
              >
                <span className="min-w-0 flex-1 truncate">{a.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {a.icao ? `${a.iata}・${a.icao}` : a.iata}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {showBusy && (
        <p className="text-xs text-muted-foreground">{t("flightSearching")}</p>
      )}
      {showError !== null && (
        <MessageBox kind="error" dense>
          {showError}
        </MessageBox>
      )}

      {showResult && !showBusy && (
        <FlightPreview flight={showResult} onApply={() => onApply(showResult)} />
      )}
    </div>
  );
}

/**
 * 確定前のプレビュー。**自動では適用しない。**
 * 便名の打ち間違いに気付ける最後の場所であり、予測値かどうかもここで示す。
 */
function FlightPreview({ flight, onApply }: { flight: Flight; onApply: () => void }) {
  const t = useTranslations("event");
  const dur = durationMinutes(flight);

  return (
    <button
      type="button"
      onClick={onApply}
      className="block w-full rounded-lg border border-foreground/10 p-3 text-left transition hover:bg-foreground/10"
      aria-label={t("flightApply")}
    >
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold">{flight.number}</span>
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {flight.airlineName}
        </span>
        {dur !== null && (
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {t("flightHours", { h: Math.floor(dur / 60), m: dur % 60 })}
          </span>
        )}
      </div>

      <div className="mt-2 flex items-center gap-3">
        <Endpoint
          code={flight.departure.iata ?? flight.departure.name}
          city={flight.departure.municipality}
          time={flight.departure.scheduledLocal}
        />
        <span className="text-subtle-foreground">→</span>
        <Endpoint
          code={flight.arrival.iata ?? flight.arrival.name}
          city={flight.arrival.municipality}
          time={flight.arrival.scheduledLocal}
        />
      </div>

      {flight.source.kind === "estimated" && (
        <p className="mt-2 text-xs text-muted-foreground">
          {t("flightEstimatedFrom", { date: flight.source.basedOn })}
        </p>
      )}
      {!isComplete(flight) && (
        <p className="mt-2 text-xs text-muted-foreground">{t("flightMissingTimes")}</p>
      )}
    </button>
  );
}

function Endpoint({
  code,
  city,
  time,
}: {
  code: string;
  city: string | null;
  time: string | null;
}) {
  return (
    <div className="min-w-0 flex-1">
      <div className="truncate text-sm font-medium">{code}</div>
      <div className="text-lg font-semibold tabular-nums">
        {time ? time.slice(11, 16) : "--:--"}
      </div>
      {city && <div className="truncate text-xs text-muted-foreground">{city}</div>}
    </div>
  );
}
