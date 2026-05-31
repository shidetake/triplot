"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

// コピーで旅行を作った直後、はみ出して省かれた予定の件数をトーストで知らせる。
// 件数は ?copiedDropped=N で渡ってくる。表示後はURLからクエリを消して、
// リロードで再表示されないようにする。
export function CopyResultToast({ count }: { count: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const [show, setShow] = useState(count > 0);

  useEffect(() => {
    if (count <= 0) return;
    // クエリを消す（履歴を汚さない replace）。
    router.replace(pathname);
    const t = setTimeout(() => setShow(false), 5000);
    return () => clearTimeout(t);
  }, [count, pathname, router]);

  if (!show) return null;

  return (
    <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-md bg-zinc-900 px-4 py-2 text-sm text-white shadow-lg">
      日数が短いため、{count}件の予定はコピーされませんでした
    </div>
  );
}
