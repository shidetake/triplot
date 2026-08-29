import { FUNCTION_MAX_SECONDS } from "@/lib/import/process";
import type { createServiceClient } from "@/lib/supabase/service";

type ServiceClient = ReturnType<typeof createServiceClient>;

// drain（毎分の cron）の排他。**処理中なら次の実行はすぐ降りる。**
//
// 単一の UPDATE で「期限切れなら自分のものにする」を原子的にやる（条件付き更新
// なので、同時に来た2つのうち片方しか行を返さない）。行が返らなければ誰かが
// 握っている＝この回は何もしない。
//
// リース（期限つき）にしてあるので、実行が途中で死んでも自動で解ける。死んだ
// 実行がロックを握ったままだと、以降 drain が永久に止まる。
const LEASE = "import_drain";

// **関数の寿命より長く取る。** 短いと、まだ走っている実行のリースが先に切れて次が
// 入ってくる＝ロックが無いのと同じになる。寿命を伸ばしたらここも連動して伸ばす
// （FUNCTION_MAX_SECONDS から導いているので、片方だけ動かせない）。
const LEASE_TTL_MS = FUNCTION_MAX_SECONDS * 1000 + 60_000;

export async function acquireDrainLease(
  supabase: ServiceClient,
): Promise<boolean> {
  const now = new Date();
  const { data } = await supabase
    .from("drain_leases")
    .update({
      locked_until: new Date(now.getTime() + LEASE_TTL_MS).toISOString(),
    })
    .eq("name", LEASE)
    .lt("locked_until", now.toISOString())
    .select("name");
  return (data ?? []).length > 0;
}

export async function releaseDrainLease(
  supabase: ServiceClient,
): Promise<void> {
  await supabase
    .from("drain_leases")
    .update({ locked_until: new Date().toISOString() })
    .eq("name", LEASE);
}
