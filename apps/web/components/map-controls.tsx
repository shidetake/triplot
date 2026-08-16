"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { AdvancedMarker, useMap } from "@vis.gl/react-google-maps";

import { computeScaleBar } from "@triplot/shared/mapScale";
import type { MapRegion } from "@triplot/shared/mapLabelLayout";

// 地図の操作系（現在地・方位磁針・縮尺バー）。iOS の場所タブと同じ仕様・
// 同じ見た目に揃える（本家 Google マップ / iOS マップの慣行に寄せた形）。
// Google Maps JS の既定 UI（disableDefaultUI）は使わず、iOS と同じ挙動を
// 自前で描く: 現在地は「ズームを変えずパンだけ」、方位磁針は真北の間は隠れ、
// 縮尺バーはズームした時だけ出て約5秒でフェードアウトする。
//
// 縮尺の計算は shared の computeScaleBar（RN と共用。1/2/5 刻みの綺麗な数に
// 丸める Leaflet 方式）。

// Material Symbols "navigation"（塗り）。iOS と同一パス。
const NAVIGATION_PATH =
  "M480-240 222-130q-13 5-24.5 2.5T178-138q-8-8-10.5-20t2.5-25l273-615q5-12 15.5-18t21.5-6q11 0 21.5 6t15.5 18l273 615q5 13 2.5 25T782-138q-8 8-19.5 10.5T738-130L480-240Z";

// 現在地の青丸（iOS の MyLocationDot と同じ: 半透明のハロー＋白縁の青丸）。
function MyLocationDot({ size = 18 }: { size?: number }) {
  const halo = size * 2.4;
  return (
    <span
      className="relative inline-flex items-center justify-center"
      style={{ width: halo, height: halo }}
    >
      <span
        className="absolute rounded-full"
        style={{
          width: halo,
          height: halo,
          backgroundColor: "rgba(66,133,244,0.25)",
        }}
      />
      <span
        className="rounded-full border-2 border-white"
        style={{
          width: size,
          height: size,
          backgroundColor: "#4285F4",
          boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
        }}
      />
    </span>
  );
}

const buttonClass =
  "pointer-events-auto flex items-center justify-center rounded-full bg-background shadow-[0_2px_6px_rgba(0,0,0,0.15)] transition";

export function MapControls({
  // 位置を指定するモード中は地図に集中させるため操作系を出さない（iOS と同じ）。
  hidden = false,
}: {
  hidden?: boolean;
}) {
  const map = useMap();
  const [coords, setCoords] = useState<google.maps.LatLngLiteral | null>(null);
  // 現在地を中心に据えている間だけボタンを青塗りにする（本家と同じ）。
  // ユーザーが自分で地図を動かしたら解除する。
  const [following, setFollowing] = useState(false);
  const [heading, setHeading] = useState(0);
  const [scale, setScale] = useState<{
    value: number;
    unit: "m" | "km";
    widthPx: number;
  } | null>(null);
  const [scaleVisible, setScaleVisible] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevZoom = useRef<number | null>(null);

  // 現在地の購読（許可された時だけ。拒否されてもボタンは出したままにして、
  // 押した時に改めてブラウザの許可を求められるようにする）。
  useEffect(() => {
    if (!navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (pos) =>
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: true },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  // 縮尺バーの値を今の表示範囲から出す。ズーム量が変わった時だけ姿を見せ、
  // 約5秒後に消す（パンだけでは出さない＝本家 Google マップと同じ）。
  const recompute = useCallback(() => {
    if (!map) return;
    const b = map.getBounds();
    const div = map.getDiv();
    if (!b || !div) return;
    const ne = b.getNorthEast();
    const sw = b.getSouthWest();
    const region: MapRegion = {
      latitude: (ne.lat() + sw.lat()) / 2,
      longitude: (ne.lng() + sw.lng()) / 2,
      latitudeDelta: Math.abs(ne.lat() - sw.lat()),
      longitudeDelta: Math.abs(ne.lng() - sw.lng()),
    };
    setScale(
      computeScaleBar(
        region,
        { width: div.clientWidth, height: div.clientHeight },
        100,
      ),
    );
  }, [map]);

  const flashScale = useCallback(() => {
    setScaleVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setScaleVisible(false), 5000);
  }, []);

  useEffect(() => {
    if (!map) return;
    const listeners = [
      map.addListener("bounds_changed", () => {
        recompute();
        const z = map.getZoom() ?? null;
        if (z != null && prevZoom.current != null && z !== prevZoom.current) {
          flashScale();
        }
        prevZoom.current = z;
      }),
      map.addListener("heading_changed", () => setHeading(map.getHeading() ?? 0)),
      // 自分で動かしたら「現在地を追っている」状態は解除（本家と同じ）。
      map.addListener("dragstart", () => setFollowing(false)),
      // 初回の値は地図の描画が落ち着いた時に取る（effect の中で直接 setState
      // すると連鎖レンダーになるため、外部イベント経由で受け取る）。
      map.addListener("idle", recompute),
    ];
    return () => {
      listeners.forEach((l) => l.remove());
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [map, recompute, flashScale]);

  // ズームは一切変えずパンだけ（本家 Google マップの現在地ボタンと同じ）。
  // まだ座標が無い（許可前・取得前）ならその場で1回取りに行く。
  const goToMyLocation = () => {
    if (!map) return;
    if (coords) {
      map.panTo(coords);
      setFollowing(true);
      return;
    }
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setCoords(c);
        map.panTo(c);
        setFollowing(true);
      },
      () => {},
    );
  };

  return (
    <>
      {coords && (
        <AdvancedMarker position={coords} zIndex={50}>
          <MyLocationDot />
        </AdvancedMarker>
      )}

      {!hidden && (
        // 操作系はまとめて地図の上に重ねる。地図のドラッグを邪魔しないよう
        // 器は pointer-events-none にし、各ボタンだけ拾う。
        <div className="pointer-events-none absolute inset-0 z-10">
          {/* 縮尺バー（左下）。右側は現在地・方位磁針の縦列なので本家と同じ左下。
              明暗どちらのベースマップでも読めるようハロー付きの文字にする。 */}
          {scale && (
            <div
              className="absolute left-3 bottom-16 transition-opacity duration-300 md:bottom-4"
              style={{ opacity: scaleVisible ? 1 : 0 }}
            >
              {/* ハローの色は地図の明暗に合わせる（iOS の textShadowColor と同値）。
                  ベースマップの色はアプリのテーマに追従するので dark: で足りる。 */}
              <div className="mb-0.5 text-[11px] font-medium text-[#202124] [text-shadow:0_0_2px_#ffffff] dark:text-white dark:[text-shadow:0_0_2px_#242f3e]">
                {scale.value} {scale.unit}
              </div>
              <div
                className="h-[7px] border-b-[1.5px] border-l-[1.5px] border-r-[1.5px] border-[#3c4043] dark:border-[#e8eaed]"
                style={{ width: scale.widthPx }}
              />
            </div>
          )}

          {/* 方位磁針（現在地ボタンの真上）。真北の間は出さず、回すと現れる。
              針は地図の回転と逆に回して常に真北を指す。タップで北へ戻す。 */}
          {Math.abs(heading) > 0.5 && (
            <button
              type="button"
              onClick={() => map?.setHeading(0)}
              aria-label="地図の向きを北にリセット"
              title="地図の向きを北にリセット"
              className={`${buttonClass} absolute right-3 bottom-[8.5rem] h-10 w-10 md:bottom-[4.5rem]`}
            >
              <svg
                viewBox="0 0 24 24"
                width={28}
                height={28}
                style={{ transform: `rotate(${-heading}deg)` }}
                aria-hidden
              >
                <path d="M12,2 L15,12 L9,12 Z" fill="#EA4335" />
                <path
                  d="M12,22 L15,12 L9,12 Z"
                  className="fill-muted-foreground"
                />
              </svg>
            </button>
          )}

          {/* 現在地に戻る（右下）。現在地を中心に据えている間だけ青塗り、
              それ以外はアウトラインのみ（本家 Google マップ・iOS マップと同じ）。 */}
          <button
            type="button"
            onClick={goToMyLocation}
            aria-label="現在地に戻る"
            title="現在地に戻る"
            className={`${buttonClass} absolute right-3 bottom-16 h-11 w-11 md:bottom-4`}
          >
            <svg
              viewBox="0 -960 960 960"
              width={26}
              height={26}
              // グリフの視覚重心が左下に寄っているので、45°回転後の座標系で
              // 少し右上へ寄せる（iOS 側と同じ補正）。
              style={{ transform: "translate(1.5px, -1.5px) rotate(45deg)" }}
              aria-hidden
            >
              <path
                d={NAVIGATION_PATH}
                fill={following ? "#4285F4" : "none"}
                stroke={following ? "none" : "#5f6368"}
                strokeWidth={following ? 0 : 60}
              />
            </svg>
          </button>
        </div>
      )}
    </>
  );
}
