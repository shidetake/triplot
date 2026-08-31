-- 抽出（受信時）の排他をユーザ単位で取れるようにする。
--
-- ■ なぜ要るか
-- 受信時の抽出は1通ずつ独立に走っていた（webhook が after() で投げる）ので、
-- まとめて転送されたメールは同時に抽出される。マージは「既に抽出済みの下書き」
-- を候補に探す作りなので、**同時に処理された相手はお互い候補に見えない**。
-- 実測: Uber の1回の乗車が4通（レシート2通・銀行の利用通知・差額調整）に
-- 分かれて届き、到着 15:54:12〜19 / 抽出 15:54:24〜30 と完全に重なって、
-- 承認番号が一致しているのに1件も合体しなかった。
-- レシートをまとめて転送するのは想定している使い方そのものなので、
-- 転送のたびに結果が変わることになる。
--
-- ■ なぜ名前ごとか
-- マージは同じユーザの下書きの中でしか起きないので、直列化が要るのも
-- ユーザ単位。全体で1つのロックにすると無関係なユーザ同士が待ち合わせる。
-- 既存の drain（`import_drain`）も同じ表・同じ関数に乗せる。
--
-- ■ なぜ RPC か
-- 「期限切れなら自分のものにする」を1文で原子的にやりたいが、
-- `insert ... on conflict do update where` は PostgREST から書けない。
-- 行を事前に用意しておく方式（drain のやり方）はユーザが増えるたびに
-- 行を作る必要があり、作り忘れると黙って排他が効かなくなる。

create or replace function public.try_acquire_lease(
  p_name text,
  p_ttl_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  acquired boolean;
begin
  -- サービスロール（cron・webhook）専用。
  if auth.role() is distinct from 'service_role' then
    raise exception 'forbidden';
  end if;

  insert into public.drain_leases (name, locked_until)
  values (p_name, now() + make_interval(secs => p_ttl_seconds))
  on conflict (name) do update
    set locked_until = excluded.locked_until
    where public.drain_leases.locked_until < now()
  returning true into acquired;

  return coalesce(acquired, false);
end;
$$;

create or replace function public.release_lease(p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'forbidden';
  end if;

  update public.drain_leases set locked_until = now() where name = p_name;
end;
$$;

-- 関数は既定で PUBLIC に execute が付く。service_role も PUBLIC を継承するので、
-- **revoke だけだと service_role からも呼べなくなる**（取り込みが丸ごと止まる）。
-- 落としてから、使う役割にだけ明示的に付け直す。
revoke execute on function public.try_acquire_lease(text, integer) from public, anon, authenticated;
revoke execute on function public.release_lease(text) from public, anon, authenticated;
grant execute on function public.try_acquire_lease(text, integer) to service_role;
grant execute on function public.release_lease(text) to service_role;
