"use client";

import { useSyncExternalStore } from "react";

// 旅行詳細ページの4タブ（予定/場所/費用/TODO）。TripDetailTabs だけでなく、
// PlacesSection・ScheduleSection 等、タブ内容側からも「今どのタブがアクティブか」
// を読めるようにするための最小限の外部ストア。React Context だと Provider の
// 子孫でしか読めず、Provider の外側にいるコンポーネントからは読めないため、
// モジュールスコープの pub/sub にして木構造の位置に関係なく購読できるようにする。
//
// タブ切替は実ナビゲーションにせず history.replaceState だけで URL を同期する
// （TripDetailTabs 参照）。replaceState は popstate を発火しないため、クリック
// 直後の反映は自前の CustomEvent で配る。
export const TRIP_TABS = ["schedule", "places", "expenses", "todos"] as const;
export type TripTabKey = (typeof TRIP_TABS)[number];

function isTabKey(value: string | null): value is TripTabKey {
  return TRIP_TABS.some((tab) => tab === value);
}

const TAB_CHANGE_EVENT = "triplot:trip-tab-change";

function readUrlTab(): TripTabKey {
  const param = new URLSearchParams(window.location.search).get("tab");
  return isTabKey(param) ? param : "schedule";
}

function getServerSnapshot(): TripTabKey {
  return "schedule";
}

function subscribe(callback: () => void) {
  window.addEventListener("popstate", callback);
  window.addEventListener(TAB_CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("popstate", callback);
    window.removeEventListener(TAB_CHANGE_EVENT, callback);
  };
}

// タブバーのクリック等、明示的な切替はここから呼ぶ。URL を書き換えつつ
// 全購読者（各タブの isActive 判定）へ即座に配る。
export function setActiveTripTab(tab: TripTabKey) {
  const url = new URL(window.location.href);
  url.searchParams.set("tab", tab);
  window.history.replaceState(null, "", url);
  window.dispatchEvent(new Event(TAB_CHANGE_EVENT));
}

export function useActiveTripTab(): TripTabKey {
  return useSyncExternalStore(subscribe, readUrlTab, getServerSnapshot);
}
