"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

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
      <Button
        type="button"
        size="icon"
        onClick={(e) => setAnchor({ x: e.clientX, y: e.clientY })}
        aria-label="旅行を作成"
        title="旅行を作成"
      >
        <PlusIcon size={18} />
      </Button>

      {anchor && (
        <FormPopover anchor={anchor} onClose={() => setAnchor(null)} label="旅行を作成">
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
