"use client";

import { useEffect, useState } from "react";

type ChromeMargins = {
  top: number;
  bottom: number;
  // シートの高さ計算に使う viewport の高さも同じリスナーでまとめて測る
  // （resize/回転のたびに margins と一緒に更新されて欲しいため）。
  viewportHeight: number;
};

function measure(): ChromeMargins {
  if (typeof window === "undefined") {
    return { top: 0, bottom: 0, viewportHeight: 0 };
  }
  const viewportHeight = window.innerHeight;
  const topEls = document.querySelectorAll<HTMLElement>(
    "[data-mobile-chrome-top]",
  );
  const top = Math.max(
    0,
    ...Array.from(topEls).map((el) => el.getBoundingClientRect().bottom),
  );
  const bottomEls = document.querySelectorAll<HTMLElement>(
    "[data-mobile-chrome-bottom]",
  );
  const bottom = Math.max(
    0,
    ...Array.from(bottomEls).map(
      (el) => viewportHeight - el.getBoundingClientRect().top,
    ),
  );
  return { top, bottom, viewportHeight };
}

// 狭い画面のボトムシートが「展開時にどこまで見せるか」を、決め打ちの割合
// ではなく実際に画面上にある chrome（ヘッダー・タブバー）の高さを実測して
// 決める。見せたい位置は大抵「他の何か（ヘッダー帯・タブバー）の端」なので、
// その実測値を毎回引き算すれば、端末の画面高が変わっても崩れない
// （0.7 のような画面高に対する割合の決め打ちだと、画面が低い端末ほど
// 実際の余白が減ってしまう）。
//
// - top: [data-mobile-chrome-top] を持つ要素（AppHeader・TripHeaderCompact）
//   の下端のうち最大値。スクロールで隠れていれば自然と小さくなる
//   （sticky な AppHeader は常に残るので 0 にはならない）。
// - bottom: [data-mobile-chrome-bottom] を持つ要素（下部タブバー）の、
//   viewport 下端からの高さのうち最大値。無ければ 0（タブバーの無いページ）。
//
// 初期値は useState の遅延初期化子で同期的に実測する（useEffect 任せだと、
// vaul の非制御 snapPoints（NarrowSheet）はマウント時の初期値に固定されて
// しまい、実測が後から効いても反映されない）。
//
// ただし初期化子はレンダー中に走るため、クライアント遷移（旅行一覧→旅行詳細）
// の途中では遷移先ページの chrome（TripHeaderCompact 等）がまだ DOM に無く、
// 実測から漏れる（リロード時は hydration 時点で全部あるので漏れない——
// 「入り方によって展開位置が変わる」不具合として実機で発覚）。マウント後
// （DOM 反映後）に一度再実測して取りこぼしを拾う。値が変わらない時は
// setState しない（NarrowSheet のようにマウント時点で DOM が揃っている
// 呼び出し元では無駄な再レンダーを起こさない）。
export function useMobileChromeMargins(): ChromeMargins {
  const [state, setState] = useState(measure);

  useEffect(() => {
    const remeasure = () =>
      setState((prev) => {
        const next = measure();
        return next.top === prev.top &&
          next.bottom === prev.bottom &&
          next.viewportHeight === prev.viewportHeight
          ? prev
          : next;
      });
    remeasure();
    window.addEventListener("resize", remeasure);
    return () => window.removeEventListener("resize", remeasure);
  }, []);

  return state;
}
