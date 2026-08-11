// FlightApi ポートの実装。Edge Function（flight-lookup）越しに提供元を叩く。
//
// 直接 RapidAPI を叩かないのは、キーを利用元で縛れないため（Google Maps の
// キーと違い bundle ID・リファラ制限が無い）。関数側は薄い中継で、応答の解析は
// flightAeroDataBox.ts が行う＝web と RN で同じコードが動く。

import { parseAeroDataBoxFlights, parseOperatingDates } from "../flightAeroDataBox";
import type { FlightApi } from "../flightLookup";
import type { DB } from "./client";

type FunctionResponse = { payload?: unknown; cached?: boolean; error?: string };

async function call(sb: DB, body: Record<string, unknown>): Promise<FunctionResponse> {
  const { data, error } = await sb.functions.invoke<FunctionResponse>(
    "flight-lookup",
    { body },
  );
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data ?? {};
}

/**
 * 便名は呼び出し側が正規化済み（parseFlightNumber）である前提。
 * 関数側でも独立に検証しているので、素の入力をそのまま渡さないこと。
 */
export function createFlightApi(sb: DB): FlightApi {
  return {
    async byNumberAndDate(number, date) {
      const { payload } = await call(sb, { kind: "flight", number, date });
      return parseAeroDataBoxFlights(payload, number);
    },
    async operatingDates(number) {
      const { payload } = await call(sb, { kind: "dates", number });
      return parseOperatingDates(payload);
    },
    async peekByNumberAndDate(number, date) {
      const res = await call(sb, { kind: "flight", number, date, peek: true });
      return res.cached ? parseAeroDataBoxFlights(res.payload, number) : null;
    },
  };
}
