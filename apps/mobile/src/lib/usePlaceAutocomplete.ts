import { useEffect, useRef, useState } from "react";

import {
  autocompletePlaces,
  fetchPlaceDetails,
  type PlaceCandidate,
  type PlacePrediction,
} from "@triplot/shared/placesSearch";

import { BUNDLE_ID, PLACES_API_KEY } from "./googlePlaces";

// autocomplete 群 + 確定時の details を1セッションに束ねる課金トークン（web の
// sessionToken と同じ役割）。places.tsx の newSessionToken と同じ発行方式。
function newSessionToken(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// Google Places の入力中サジェスト（300ms debounce・世代番号で古い応答を捨てる・
// セッショントークンで課金最適化）を場所欄から使うためのフック。地図タブ
// （places.tsx）の同じロジックを、場所欄（PlacePicker）でも使えるよう切り出した。
export function usePlaceAutocomplete(biasCenter?: { lat: number; lng: number }) {
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const epochRef = useRef(0);
  const sessionTokenRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const clear = () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    epochRef.current += 1;
    setPredictions([]);
  };

  const search = (query: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!PLACES_API_KEY || !query.trim()) {
      clear();
      return;
    }
    if (!sessionTokenRef.current) sessionTokenRef.current = newSessionToken();
    const epoch = epochRef.current;
    debounceRef.current = setTimeout(() => {
      void autocompletePlaces(query, {
        apiKey: PLACES_API_KEY,
        iosBundleId: BUNDLE_ID,
        biasCenter,
        sessionToken: sessionTokenRef.current ?? undefined,
      })
        .then((r) => {
          if (epoch === epochRef.current) setPredictions(r);
        })
        .catch(() => {
          if (epoch === epochRef.current) setPredictions([]);
        });
    }, 300);
  };

  // サジェスト確定: details を引いて候補を返す（セッションはここで消費して終了）。
  const resolve = async (p: PlacePrediction): Promise<PlaceCandidate | null> => {
    if (!PLACES_API_KEY) return null;
    try {
      return await fetchPlaceDetails(p.placeId, {
        apiKey: PLACES_API_KEY,
        iosBundleId: BUNDLE_ID,
        sessionToken: sessionTokenRef.current ?? undefined,
      });
    } finally {
      sessionTokenRef.current = null;
    }
  };

  return { predictions, search, clear, resolve, enabled: !!PLACES_API_KEY };
}
