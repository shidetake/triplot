"use client";

import { useState } from "react";

import { type CopyableTrip, CreateTripForm } from "./create-trip-form";
import { PlusIcon } from "./icons";
import { type Anchor, FormPopover } from "./form-popover";

export function CreateTripButton({
  defaultDisplayName,
  trips,
}: {
  defaultDisplayName?: string | null;
  trips: CopyableTrip[];
}) {
  const [anchor, setAnchor] = useState<Anchor | null>(null);

  return (
    <div>
      <button
        type="button"
        onClick={(e) => setAnchor({ x: e.clientX, y: e.clientY })}
        aria-label="旅行を作成"
        title="旅行を作成"
        className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground transition hover:bg-primary/90"
      >
        <PlusIcon size={18} />
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
