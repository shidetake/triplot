"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { PAGE_HEADER_ACTIONS_ID } from "./page-header-actions-id";

// ヘッダーのバー（app-header.tsx）の右、受信箱の左に、ページ固有の操作を
// 差し込む。バーはサーバーで描く共通の部品なので、ページ側のクライアントの
// 状態（ノートの表示中／編集中）で切り替わるボタンはポータルで入れる。
// iOS のナビバーの右（headerRight）と同じ位置。
export function PageHeaderActions({ children }: { children: ReactNode }) {
  // 差し込み口はサーバーで描いた DOM にあり、ページの間は入れ替わらない。
  // サーバーでの描画とハイドレーションの間は null（何も差し込まない）。
  const slot = useSyncExternalStore(
    noSubscribe,
    () => document.getElementById(PAGE_HEADER_ACTIONS_ID),
    () => null,
  );
  return slot ? createPortal(children, slot) : null;
}

const noSubscribe = () => () => {};
