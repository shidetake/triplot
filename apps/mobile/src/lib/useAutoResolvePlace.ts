import { useEffect, useRef, useState } from "react";

import type { PlaceInput } from "@triplot/shared/data/place";
import type { DraftAutoResolvePlace } from "@triplot/shared/import/drafts";
import { resolveNamedPlace } from "@triplot/shared/placesSearch";

import { PLACES_API_KEY } from "./googlePlaces";

// 取り込みの下書きの場所を、確定フォームを開いた時に Google の場所へ丸める。
//
// **web の place-picker の autoResolve と同じ役目**（apps/web/components/
// place-picker.tsx）。web だけが持っていて iOS が持っていなかったので、確定すると
// 場所が「店名の自由入力」のまま保存されていた。
//
// **開いた時に走らせる**のが要点。サーバー側の事前解決（取り込み時に旅行が
// 決まっていれば解く）だけだと、後から手で旅行を割り当てた下書きは解決されない。
// かといって割り当て後にバックグラウンドで解き直すと、**解決が終わる前に確定
// できてしまい、間違った場所で保存される**。フォームを開いてから保存するまでの
// 間に終わらせれば、その競合が起きない。
//
// 見つからなければ何もしない（自由入力のまま）。生半可な一致で誤った店に
// 解決するより、素直に「解決できない」方が安全（resolveNamedPlace の閾値）。
export function useAutoResolvePlace({
  autoResolve,
  biasCenter,
  enabled,
  onResolved,
}: {
  autoResolve: DraftAutoResolvePlace;
  biasCenter: { lat: number; lng: number } | undefined;
  // 保存済みの場所が既に入っている等、解決の必要が無いときは false。
  enabled: boolean;
  onResolved: (place: PlaceInput) => void;
}): { resolving: boolean } {
  const tried = useRef(false);
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    if (tried.current || !enabled) return;
    const name = autoResolve?.name?.trim();
    // 住所があればバイアスは要らない（resolveNamedPlace 参照）。
    const address = autoResolve?.address ?? null;
    if (!name || (!biasCenter && !address) || !PLACES_API_KEY) return;
    tried.current = true;
    let alive = true;
    void (async () => {
      // setState はエフェクトの同期実行部ではなく非同期の中で呼ぶ
      // （同期で呼ぶと連鎖レンダーになる。react-hooks の警告）。
      setResolving(true);
      try {
        const found = await resolveNamedPlace(name, address, {
          apiKey: PLACES_API_KEY,
          biasCenter,
        });
        if (alive && found) {
          onResolved({
            kind: "google",
            placeId: found.placeId,
            name: found.name,
            address: found.formattedAddress,
            lat: found.lat,
            lng: found.lng,
            region: found.region,
            locality: found.locality,
            icon: null,
          });
        }
      } finally {
        if (alive) setResolving(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [autoResolve, biasCenter, enabled, onResolved]);

  return { resolving };
}
