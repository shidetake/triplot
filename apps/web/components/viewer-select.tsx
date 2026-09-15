"use client";

import { Select } from "@base-ui/react/select";

import { MemberAvatar } from "./member-avatar";
import { CheckIcon, ChevronIcon, ClockIcon } from "./icons";
import { menuItemClass } from "./menu-item";

export type ViewerMember = {
  id: string;
  display_name: string;
  color: number | null;
  avatarUrl?: string | null;
};

// 「誰の時計でカレンダーを見るか」の切り替え。**時刻ガターの頭（左上の角）**に
// 置く（ガターは時間軸そのものなので、「誰の時間軸か」はその頭に書く。列ヘッダは
// 日付のもの）。角は元から空いているので、カレンダーの高さを取らない。RN の
// week-calendar と同じ形。
//
// native <select> は <option> にアバターを描けないので Base UI の Select
// （ui-guidelines「部品の作り方」step2）。トリガは角に収まるよう、文字を持たず
// アバター＋時計の徽章＋開く印だけにする——誰かは色と頭文字が示す。
export function ViewerSelect({
  members,
  value,
  onChange,
  label,
}: {
  members: ViewerMember[];
  value: string;
  onChange: (id: string) => void;
  // 読み上げ名（画面には出さない）。
  label: string;
}) {
  return (
    <Select.Root
      value={value}
      onValueChange={(v) => onChange((v as string | null) ?? "")}
    >
      <Select.Trigger
        aria-label={label}
        title={label}
        className="group flex flex-col items-center gap-px rounded p-1 transition hover:bg-foreground/10"
      >
        <Select.Value>
          {(val) => {
            const m = members.find((x) => x.id === val);
            return (
              <span className="relative inline-flex">
                <MemberAvatar
                  name={m?.display_name}
                  color={m?.color ?? null}
                  imageUrl={m?.avatarUrl}
                  size="md"
                />
                {/* アバターに重なる徽章は右上（管理者の王冠と同じ位置・寸法）。
                    色は中立にする——琥珀は要対応の色で、これは知らせではなく
                    「時間の話だ」という種別の印だから。 */}
                <span className="absolute -right-1 -top-1 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-background text-muted-foreground ring-1 ring-background">
                  <ClockIcon size={10} />
                </span>
              </span>
            );
          }}
        </Select.Value>
        <Select.Icon className="text-muted-foreground">
          <ChevronIcon
            size={12}
            className="rotate-90 transition group-aria-expanded:rotate-[-90deg]"
          />
        </Select.Icon>
      </Select.Trigger>

      <Select.Portal>
        <Select.Positioner className="z-50" sideOffset={4} align="start">
          <Select.Popup className="max-h-64 min-w-44 overflow-y-auto rounded-md border border-foreground/20 bg-background py-1 shadow-lg">
            {members.map((m) => (
              <Select.Item
                key={m.id}
                value={m.id}
                className={`flex items-center gap-2 ${menuItemClass} data-[selected]:bg-accent data-[selected]:font-medium`}
              >
                <MemberAvatar
                  name={m.display_name}
                  color={m.color}
                  imageUrl={m.avatarUrl}
                  size="md"
                />
                <Select.ItemText className="min-w-0 flex-1 truncate">
                  {m.display_name}
                </Select.ItemText>
                <Select.ItemIndicator className="shrink-0 text-muted-foreground">
                  <CheckIcon size={16} />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}
