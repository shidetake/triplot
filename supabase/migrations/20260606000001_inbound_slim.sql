-- ────────────────────────────────────────────────────────────
-- 受信メールの保持ポリシー（痩せ版＋ライフサイクル削除）
-- ────────────────────────────────────────────────────────────
-- 方針（合意）: 丸ごと MIME は受信〜背景抽出までの一時的なものとし、抽出成功時に
-- 本文＋PDFテキストの「痩せ版（body_text）」へ置き換えて raw を捨てる。確定/破棄で
-- 痩せ版も消す（プライバシー）。未抽出(over_quota/error)は再処理用に raw を残し、
-- 90日 expire で掃除（expire ジョブは別途）。

alter table inbound_emails add column body_text text;
-- 抽出成功時に丸ごと MIME を捨てられるよう nullable に。
alter table inbound_emails alter column raw drop not null;

-- 解決（confirmed/dismissed）時に raw・body_text を消す（保持最小化）。
create or replace function public.resolve_inbound_email(
  p_id         uuid,
  p_status     text,
  p_expense_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $body$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_status not in ('confirmed', 'dismissed') then
    raise exception 'invalid status';
  end if;
  update inbound_emails
  set status = p_status,
      expense_id = case when p_status = 'confirmed' then p_expense_id else null end,
      raw = null,
      body_text = null
  where id = p_id and user_id = v_uid;
end;
$body$;
