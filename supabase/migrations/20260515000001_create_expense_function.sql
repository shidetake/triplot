-- create_expense：expense + 関連 expense_splits を 1 トランザクションで作る。
-- SECURITY DEFINER で RLS をバイパスし、関数の入口で auth.uid() と trip 参加を確認する。
--
-- ルール：
--  - 呼び出し者は trip のアクティブメンバーでなければならない
--  - created_by_member_id は呼び出し者本人の trip_member.id
--  - payer_member_id は trip のアクティブメンバーでなければならない
--  - private は splittable=false 強制（テーブル CHECK 制約と合わせる）
--  - splittable=true のとき p_split_member_ids は trip のアクティブメンバーに限る
--  - splittable=false のとき p_split_member_ids は無視

create or replace function public.create_expense(
  p_trip_id           text,
  p_amount            numeric,
  p_currency          text,
  p_payer_member_id   uuid,
  p_visibility        text,
  p_splittable        boolean,
  p_note              text,
  p_paid_at           timestamptz,
  p_split_member_ids  uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $body$
declare
  v_uid              uuid := auth.uid();
  v_my_member_id     uuid;
  v_expense_id       uuid;
  v_split_member_id  uuid;
  v_payer_ok         boolean;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;
  if p_currency not in ('JPY', 'USD') then
    raise exception 'invalid currency';
  end if;
  if p_visibility not in ('shared', 'private') then
    raise exception 'invalid visibility';
  end if;
  if p_visibility = 'private' and p_splittable then
    raise exception 'private expense cannot be splittable';
  end if;

  -- 呼び出し者のアクティブメンバー ID を取得
  select id into v_my_member_id
  from trip_members
  where trip_id = p_trip_id
    and user_id = v_uid
    and left_at is null;

  if v_my_member_id is null then
    raise exception 'not an active member of this trip' using errcode = '42501';
  end if;

  -- payer も同じ trip のアクティブメンバーであること
  select exists (
    select 1 from trip_members
    where id = p_payer_member_id
      and trip_id = p_trip_id
      and left_at is null
  ) into v_payer_ok;

  if not v_payer_ok then
    raise exception 'payer is not an active member of this trip';
  end if;

  insert into expenses (
    trip_id, created_by_member_id, visibility, amount, currency,
    payer_member_id, splittable, note, paid_at
  )
  values (
    p_trip_id, v_my_member_id, p_visibility, p_amount, p_currency,
    p_payer_member_id, p_splittable, nullif(trim(coalesce(p_note, '')), ''),
    coalesce(p_paid_at, now())
  )
  returning id into v_expense_id;

  if p_splittable and p_split_member_ids is not null then
    foreach v_split_member_id in array p_split_member_ids loop
      -- 各 split 対象が同 trip のアクティブメンバーであることを保証
      if not exists (
        select 1 from trip_members
        where id = v_split_member_id
          and trip_id = p_trip_id
          and left_at is null
      ) then
        raise exception 'split member % is not an active member of this trip',
          v_split_member_id;
      end if;
      insert into expense_splits (expense_id, member_id)
      values (v_expense_id, v_split_member_id)
      on conflict do nothing;
    end loop;
  end if;

  -- 旅行のアクティビティ時刻を更新（リスト並び替え用）
  update trips set last_activity_at = now() where id = p_trip_id;

  return v_expense_id;
end;
$body$;

revoke all on function public.create_expense(
  text, numeric, text, uuid, text, boolean, text, timestamptz, uuid[]
) from public;
grant execute on function public.create_expense(
  text, numeric, text, uuid, text, boolean, text, timestamptz, uuid[]
) to authenticated;
