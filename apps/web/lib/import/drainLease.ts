import { FUNCTION_MAX_SECONDS } from "@/lib/import/importConfig";
import type { createServiceClient } from "@/lib/supabase/service";

type ServiceClient = ReturnType<typeof createServiceClient>;

// 取り込みの排他。**処理中なら後から来たほうはすぐ降りる。**
//
// 「期限切れなら自分のものにする」を1文で原子的にやる RPC に乗る
// （`try_acquire_lease`。同時に来た2つのうち片方しか true を受け取らない）。
// リース（期限つき）なので、実行が途中で死んでも自動で解ける。死んだ実行が
// ロックを握ったままだと、以降そのロックが永久に取れなくなる。
//
// 排他が要る所は3つある。
//
//   drain（毎分の cron）    cron 同士が重ならないように
//   抽出（ユーザ単位）      同時に抽出すると、お互いがまだ下書きになっていない
//                           ので**マージの候補として見えない**（同じ取引の
//                           レシートと利用通知が別々の費用として残る）
//   抽出（メール単位）      **同じ1通を2回抽出しない。** 取り込みの入口は
//                           「受信した瞬間」と「毎分の cron」の2つあり、
//                           拾ってから状態が変わるまでの間はどちらからも
//                           「未処理」に見える。実データ: 奈良バイクシェアの
//                           メールが両方から抽出され、片方は何も作らず
//                           （失敗を記録）、片方は予定を作った（成功を記録）。
//                           LLM も場所の検索もそのぶん無駄に呼んでいた。
//
// ユーザ単位なのは、マージが同じユーザの下書きの中でしか起きないから。全体で
// 1つにすると無関係なユーザ同士が待ち合わせる。
//
// **鍵は守る対象と同じ所に置く。** 以前は「呼び出し側が排他を持つ」という約束に
// していたが、入口が増えた時に守られなくなった（cron はユーザ単位の鍵を取らずに
// 同じ列へ入っていた）。今は抽出する関数自身が取る。

const DRAIN_LEASE = "import_drain";

// **関数の寿命より長く取る。** 短いと、まだ走っている実行のリースが先に切れて次が
// 入ってくる＝ロックが無いのと同じになる。寿命を伸ばしたらここも連動して伸ばす
// （FUNCTION_MAX_SECONDS から導いているので、片方だけ動かせない）。
const LEASE_TTL_SECONDS = FUNCTION_MAX_SECONDS + 60;

async function acquire(supabase: ServiceClient, name: string) {
  const { data, error } = await supabase.rpc("try_acquire_lease", {
    p_name: name,
    p_ttl_seconds: LEASE_TTL_SECONDS,
  });
  if (error) {
    console.error("[lease] acquire failed", name, error.message);
    return false;
  }
  return data === true;
}

async function release(supabase: ServiceClient, name: string) {
  const { error } = await supabase.rpc("release_lease", { p_name: name });
  if (error) console.error("[lease] release failed", name, error.message);
}

export const acquireDrainLease = (supabase: ServiceClient) =>
  acquire(supabase, DRAIN_LEASE);

export const releaseDrainLease = (supabase: ServiceClient) =>
  release(supabase, DRAIN_LEASE);

// ユーザ単位の抽出ロック。名前空間を分けておく（`import_drain` と衝突しない）。
const extractLeaseName = (userId: string) => `extract:${userId}`;

export const acquireExtractLease = (supabase: ServiceClient, userId: string) =>
  acquire(supabase, extractLeaseName(userId));

export const releaseExtractLease = (supabase: ServiceClient, userId: string) =>
  release(supabase, extractLeaseName(userId));

// メール単位の抽出ロック。1通を2回抽出しないためのもので、ユーザ単位の鍵とは
// 別の名前空間。
const emailLeaseName = (emailId: string) => `email:${emailId}`;

export const acquireEmailLease = (supabase: ServiceClient, emailId: string) =>
  acquire(supabase, emailLeaseName(emailId));

export const releaseEmailLease = (supabase: ServiceClient, emailId: string) =>
  release(supabase, emailLeaseName(emailId));
