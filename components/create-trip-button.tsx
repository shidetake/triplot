"use client";

import { useState } from "react";

import { type CopyableTrip, CreateTripForm } from "./create-trip-form";
import { type Anchor, FormPopover } from "./form-popover";

// 予定追加・費用追加と同じ「ボタン → クリック位置にポップオーバー」スタイルで
// 旅行作成フォームを出す。作成成功時はサーバアクションが新トリップへ
// redirect するので、ポップオーバーは画面遷移で自然に消える。
export function CreateTripButton({
  defaultDisplayName,
  trips,
}: {
  defaultDisplayName?: string | null;
  // コピー元に選べる過去の旅行（無ければコピー UI は出ない）。
  trips: CopyableTrip[];
}) {
  const [anchor, setAnchor] = useState<Anchor | null>(null);

  return (
    <div>
      <button
        type="button"
        onClick={(e) => setAnchor({ x: e.clientX, y: e.clientY })}
        className="inline-flex h-12 items-center justify-center rounded-md bg-black px-6 font-medium text-white transition hover:bg-zinc-800"
      >
        新しい旅行を作る
      </button>

      {anchor && (
        <FormPopover anchor={anchor} onClose={() => setAnchor(null)}>
          <CreateTripForm
            defaultDisplayName={defaultDisplayName}
            trips={trips}
            onDone={() => setAnchor(null)}
          />
        </FormPopover>
      )}
    </div>
  );
}
