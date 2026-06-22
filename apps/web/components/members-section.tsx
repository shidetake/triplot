import { chipStyle } from "@/lib/memberColors";

// 旅行ヘッダーのメンバー一覧。表示専用（色付きチップで名前を出すだけ）。
// 編集・削除・退出は /trips/[id]/members のメンバー管理画面側に集約した
// （誤タップ防止と画面 UI のクリーン化のため）。
type Member = {
  id: string;
  display_name: string;
  color: number | null;
};

export function MembersSection({ members }: { members: Member[] }) {
  return (
    <ul className="mt-2 flex flex-wrap gap-2">
      {members.map((m) => (
        <li
          key={m.id}
          style={chipStyle(m.color)}
          className="inline-flex items-center rounded-full px-3 py-1 text-sm"
        >
          {m.display_name}
        </li>
      ))}
    </ul>
  );
}
