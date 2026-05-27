-- ────────────────────────────────────────────────────────────
-- trip_members に管理者 (is_admin) 概念を追加
-- ────────────────────────────────────────────────────────────
-- 仕様:
--  - create_trip した人がデフォルト管理者
--  - 自分以外を消す（=trip から外す）には管理者である必要がある
--  - 管理者が抜けるときは、次のメンバーに自動で管理者を移譲
--    優先順: kind='member' (ログイン済み) → kind='guest'、joined_at が古い順
--  - 自分自身を消す（=退出）は誰でも可
--
-- セキュリティ:
--  - is_admin はクライアントから直接 UPDATE できないように column-level
--    GRANT を取り上げる。変更経路は SECURITY DEFINER RPC のみ
--    （create_trip / remove_trip_member）。

alter table trip_members
  add column is_admin boolean not null default false;

revoke update (is_admin) on trip_members from authenticated;

-- ────────────────────────────────────────────────────────────
-- create_trip: 作成者を管理者にする（シグネチャ不変）
-- ────────────────────────────────────────────────────────────

create or replace function public.create_trip(
  p_title             text,
  p_start_date        date,
  p_end_date          date,
  p_default_currency  text,
  p_display_name      text
)
returns text
language plpgsql
security definer
set search_path = public
as $body$
declare
  v_uid uuid := auth.uid();
  v_trip_id text;
  v_attempts int := 0;
begin
  if v_uid is null then
    raise exception 'authentication required'
      using errcode = '42501';
  end if;

  if coalesce(trim(p_title), '') = '' then
    raise exception 'title required';
  end if;
  if coalesce(trim(p_display_name), '') = '' then
    raise exception 'display_name required';
  end if;
  if p_default_currency not in ('JPY', 'USD') then
    raise exception 'invalid default_currency';
  end if;

  loop
    begin
      insert into trips (title, start_date, end_date, default_currency)
      values (p_title, p_start_date, p_end_date, p_default_currency)
      returning id into v_trip_id;
      exit;
    exception when unique_violation then
      v_attempts := v_attempts + 1;
      if v_attempts > 5 then
        raise exception 'failed to generate unique trip id after 5 attempts';
      end if;
    end;
  end loop;

  -- 作成者を管理者として登録
  insert into trip_members (trip_id, user_id, display_name, kind, color, is_admin)
  values (v_trip_id, v_uid, p_display_name, 'member',
          public.pick_member_color(v_trip_id), true);

  perform public.seed_default_expense_categories(v_trip_id);
  perform public.seed_default_place_statuses(v_trip_id);
  perform public.seed_default_trip_pin_options(v_trip_id);

  return v_trip_id;
end;
$body$;

-- ────────────────────────────────────────────────────────────
-- remove_trip_member: 権限チェック + 管理者自動移譲
-- ────────────────────────────────────────────────────────────
-- 旧仕様（誰でも誰を消してもOK）から、以下に変更:
--  - 自分自身（caller.user_id == target.user_id）は誰でも可
--  - 他人を消す場合は caller が is_admin である必要あり
--  - 消す対象が is_admin の時は、消す前に次のアクティブメンバーに admin を移譲
--    （優先: kind='member'、その中で joined_at 昇順）

create or replace function public.remove_trip_member(
  p_member_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $body$
declare
  v_uid             uuid := auth.uid();
  v_trip_id         text;
  v_target_user     uuid;
  v_target_admin    boolean;
  v_caller_admin    boolean;
  v_caller_active   boolean;
  v_successor_id    uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select trip_id, user_id, is_admin
    into v_trip_id, v_target_user, v_target_admin
  from trip_members
  where id = p_member_id;

  if v_trip_id is null then
    raise exception 'member not found';
  end if;

  -- 呼び出し元がそのトリップのアクティブメンバーかつ admin か
  select left_at is null, coalesce(is_admin, false)
    into v_caller_active, v_caller_admin
  from trip_members
  where trip_id = v_trip_id and user_id = v_uid;

  if not coalesce(v_caller_active, false) then
    raise exception 'not an active member of this trip' using errcode = '42501';
  end if;

  -- 他人を消すには admin が必要。自分自身（user_id 一致）は誰でも可。
  if v_target_user is distinct from v_uid and not v_caller_admin then
    raise exception 'admin required to remove other members' using errcode = '42501';
  end if;

  -- 消す対象が admin なら次の人に admin を移譲してから消す。
  -- 優先順: kind='member' を先に、その中で joined_at が古い順。
  if v_target_admin then
    select id into v_successor_id
    from trip_members
    where trip_id = v_trip_id
      and id != p_member_id
      and left_at is null
    order by (kind = 'guest') asc, joined_at asc
    limit 1;

    if v_successor_id is not null then
      update trip_members set is_admin = true where id = v_successor_id;
    end if;
    -- 後継が居ない（メンバーゼロになる）場合は admin は付かないまま。
    -- これは「最後の人が抜けて trip が空になる」状態で機能上問題なし。
  end if;

  update trip_members
  set left_at = now()
  where id = p_member_id and left_at is null;
end;
$body$;
