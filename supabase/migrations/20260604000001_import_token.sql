-- ────────────────────────────────────────────────────────────
-- 取り込みアドレス用の per-user トークン（費用インポート・M3 帰属）
-- ────────────────────────────────────────────────────────────
-- 各ユーザに固定の `receipts+<token>@triplot.app` を割り当て、宛先トークンで
-- 本人を特定する（From に依存しない＝Apple のメール非公開でも確実）。
-- inbound_emails には特定できたユーザを user_id で紐づける（不明なら null）。

alter table users add column import_token text unique;

alter table inbound_emails
  add column user_id uuid references users(id) on delete set null;

create index inbound_emails_user_idx on inbound_emails (user_id);

-- ensure_import_token: 呼び出しユーザの token を返す。無ければ生成して保存。
-- token は小文字 base36（lower(nanoid)）＝宛先パース時の大小文字事故を避ける。
create or replace function public.ensure_import_token()
returns text
language plpgsql
security definer
set search_path = public
as $body$
declare
  v_uid      uuid := auth.uid();
  v_token    text;
  v_attempts int := 0;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select import_token into v_token from users where id = v_uid;
  if v_token is not null then
    return v_token;
  end if;

  loop
    begin
      v_token := lower(public.nanoid(16));
      update users set import_token = v_token where id = v_uid;
      return v_token;
    exception when unique_violation then
      v_attempts := v_attempts + 1;
      if v_attempts > 5 then
        raise exception 'failed to generate unique import token';
      end if;
    end;
  end loop;
end;
$body$;

revoke all on function public.ensure_import_token() from public;
grant execute on function public.ensure_import_token() to authenticated;
