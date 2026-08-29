-- 取り込みの drain（毎分の cron）の排他。
--
-- cron は毎分来るが、1回の実行が1分を超えることがある。ロックが無いと重なった
-- 実行が同じ行を掴み、同じメールを2回抽出してしまう（下書きが二重にでき、LLM の
-- 料金も月間の枠も二重に減る）。
--
-- 「予算を cron の間隔より短くしておけば重ならない」という間接的な保証には
-- しない。予算を伸ばした瞬間に壊れるうえ、壊れたことが表に出ない。
--
-- リースにするのは、実行が途中で死んでも自動で解けるようにするため（死んだ実行が
-- ロックを握ったままだと、以降 drain が永久に止まる）。advisory lock は使えない
-- — PostgREST は接続をプールするので、HTTP リクエストを跨いで同じセッションを
-- 掴んでいられない。
create table public.drain_leases (
  name text primary key,
  locked_until timestamptz not null default now()
);

-- サービスロール（cron）だけが触る。RLS を有効にしてポリシーを1つも置かない
-- ＝一般ユーザからは読めも書けもしない（サービスロールは RLS をバイパスする）。
alter table public.drain_leases enable row level security;

insert into public.drain_leases (name) values ('import_drain');
