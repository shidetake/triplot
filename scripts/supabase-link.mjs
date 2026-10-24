// supabase CLI の link 先（本番は supabase/、staging は supabase-staging/supabase/）を
// 書く。postinstall から呼ばれるので、作業ツリーを新しく作っても link し直さずに済む。
//
// **`supabase link` を使わない。** link のコマンドはプロジェクトの API キーまで
// 読みにいくので、トークンにその権限（API Keys・API Key Secrets）が要る。手元の
// トークンは DB と設定を触る分だけに絞ってあり（docs/development.md）、link の
// ためだけに鍵を読める権限は付けない。CLI が migration や SQL で実際に読むのは
// .temp/ の project-ref と pooler-url だけで、どちらも秘密ではない（接続先の
// ホスト名にパスワードは含まない）ので、ここで書けば足りる。
//
// 既に書いてあれば触らない（CLI が自分で書き足した版や設定は残す）。

import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..");

const LINKS = [
  {
    dir: "supabase/.temp",
    ref: "cjkiglocsrtnohoxcnfh",
    pooler: "aws-1-ap-northeast-1.pooler.supabase.com",
  },
  {
    dir: "supabase-staging/supabase/.temp",
    ref: "xuytnpkvmiduffigimol",
    pooler: "aws-0-ap-northeast-1.pooler.supabase.com",
  },
];

for (const { dir, ref, pooler } of LINKS) {
  const abs = path.join(ROOT, dir);
  fs.mkdirSync(abs, { recursive: true });
  const files = {
    "project-ref": ref,
    "pooler-url": `postgresql://postgres.${ref}@${pooler}:5432/postgres`,
  };
  for (const [name, value] of Object.entries(files)) {
    const f = path.join(abs, name);
    if (!fs.existsSync(f)) fs.writeFileSync(f, value);
  }
}
