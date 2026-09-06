-- 費用の「全員で割り勘」を、割り勘対象テーブルの**行が無いこと**から推測する
-- のをやめ、事実として持つ。予定の participants_everyone
-- （20260906000100）と同じ形に揃える。
--
-- こちらを後回しにしたのは、金額は静かに壊れると気付けないから。まず予定側で
-- 形を固めてから移した。
--
-- これで「全員で割り勘」が**動的な意味**を持つようになる。旅行のメンバーが
-- 後から増えたら、その人も「全員」に含まれる（今までは作成した瞬間の
-- メンバーが具体的に書き込まれ、後から増えても入らなかった）。
--
-- 「一部の人なのに誰も居ない」は2テーブルにまたがり CHECK で書けないので、
-- create_expense / update_expense が入口で弾く。

alter table public.expenses
  add column if not exists split_everyone boolean not null default true;

-- 引数が増えるので旧シグネチャは落とす（開発中は互換 shim を作らない方針）。
drop function if exists public.create_expense(text, numeric, text, numeric, uuid, uuid, text, boolean, text, timestamp without time zone, uuid[], jsonb, uuid, text);
drop function if exists public.update_expense(uuid, numeric, text, numeric, uuid, uuid, text, boolean, text, timestamp without time zone, uuid[], jsonb, uuid, text);

CREATE OR REPLACE FUNCTION "public"."create_expense"("p_trip_id" "text", "p_local_price" numeric, "p_local_currency" "text", "p_rate_to_default" numeric, "p_category_id" "uuid", "p_payer_member_id" "uuid", "p_visibility" "text", "p_splittable" boolean, "p_note" "text", "p_paid_at" timestamp without time zone, "p_split_everyone" boolean, "p_split_member_ids" "uuid"[], "p_place" "jsonb", "p_tz_disambig_transit_id" "uuid", "p_tz_disambig_side" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid              uuid := auth.uid();
  v_my_member_id     uuid;
  v_expense_id       uuid;
  v_split_member_id  uuid;
  v_payer_ok         boolean;
  v_category_key     text;
  v_suggest_icon     text;
  v_place_id         uuid;
  v_paid_at          timestamp := coalesce(p_paid_at, (now() at time zone 'utc'));
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_local_price is null or p_local_price <= 0 then
    raise exception 'local_price must be positive';
  end if;
  if p_local_currency not in ('JPY', 'USD') then
    raise exception 'invalid local_currency';
  end if;
  if p_rate_to_default is null or p_rate_to_default <= 0 then
    raise exception 'rate_to_default must be positive';
  end if;
  if p_visibility not in ('shared', 'private') then
    raise exception 'invalid visibility';
  end if;
  if p_visibility = 'private' and p_splittable then
    raise exception 'private expense cannot be splittable';
  end if;

  perform public.validate_tz_disambig(p_trip_id, p_tz_disambig_transit_id, p_tz_disambig_side);

  select id into v_my_member_id
  from trip_members
  where trip_id = p_trip_id
    and user_id = v_uid
    and left_at is null;

  if v_my_member_id is null then
    raise exception 'not an active member of this trip' using errcode = '42501';
  end if;

  select exists (
    select 1 from trip_members
    where id = p_payer_member_id
      and trip_id = p_trip_id
      and left_at is null
  ) into v_payer_ok;

  if not v_payer_ok then
    raise exception 'payer is not an active member of this trip';
  end if;

  select key into v_category_key
  from expense_categories
  where id = p_category_id
    and trip_id = p_trip_id;

  if not found then
    raise exception 'category does not belong to this trip';
  end if;

  -- 初めてその場所を登録するときだけ、費用カテゴリから既定アイコンを当てる
  -- （resolve_place_spec 経由の find_or_create_* は新規 insert のときしか
  -- icon を使わないので、既存の場所には影響しない）。
  v_suggest_icon := public.default_place_icon_for_expense_category(v_category_key);
  if v_suggest_icon is not null then
    if p_place ? 'google' and coalesce(p_place -> 'google' ->> 'icon', '') = '' then
      p_place := jsonb_set(p_place, '{google,icon}', to_jsonb(v_suggest_icon));
    elsif p_place ? 'freetext' and coalesce(p_place -> 'freetext' ->> 'icon', '') = '' then
      p_place := jsonb_set(p_place, '{freetext,icon}', to_jsonb(v_suggest_icon));
    end if;
  end if;

  -- 既存 id の trip 所属チェックも resolve_place_spec の中で行う。
  v_place_id := public.resolve_place_spec(p_trip_id, v_my_member_id, p_place);

  insert into expenses (
    trip_id, created_by_member_id, visibility, local_price, local_currency,
    rate_to_default, category_id, payer_member_id, splittable, note, paid_at,
    place_id, tz_disambig_transit_id, tz_disambig_side, split_everyone
  )
  values (
    p_trip_id, v_my_member_id, p_visibility, p_local_price, p_local_currency,
    p_rate_to_default, p_category_id, p_payer_member_id, p_splittable,
    nullif(trim(coalesce(p_note, '')), ''), v_paid_at,
    v_place_id, p_tz_disambig_transit_id, p_tz_disambig_side,
    -- 割り勘しない費用は「全員」の概念を持たないので true のまま置く。
    not p_splittable or p_split_everyone
  )
  returning id into v_expense_id;

  -- 「全員で割り勘」は split_everyone が持つ。対象の行は「一部の人」の
  -- ときだけ入れる。**行が無いことに意味を持たせない**（0行＝全員、という
  -- 推測をやめた。予定の participants_everyone と同じ形）。
  if p_splittable and not p_split_everyone then
    if p_split_member_ids is null
       or array_length(p_split_member_ids, 1) is null then
      raise exception 'custom split members must not be empty';
    end if;
    foreach v_split_member_id in array p_split_member_ids loop
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

  update trips set last_activity_at = now() where id = p_trip_id;

  return v_expense_id;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."update_expense"("p_expense_id" "uuid", "p_local_price" numeric, "p_local_currency" "text", "p_rate_to_default" numeric, "p_category_id" "uuid", "p_payer_member_id" "uuid", "p_visibility" "text", "p_splittable" boolean, "p_note" "text", "p_paid_at" timestamp without time zone, "p_split_everyone" boolean, "p_split_member_ids" "uuid"[], "p_place" "jsonb", "p_tz_disambig_transit_id" "uuid", "p_tz_disambig_side" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid              uuid := auth.uid();
  v_trip_id          text;
  v_creator          uuid;
  v_old_vis          text;
  v_my_member_id     uuid;
  v_is_creator       boolean;
  v_payer_ok         boolean;
  v_category_key     text;
  v_suggest_icon     text;
  v_place_id         uuid;
  v_split_member_id  uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_local_price is null or p_local_price <= 0 then
    raise exception 'local_price must be positive';
  end if;
  if p_local_currency not in ('JPY', 'USD') then
    raise exception 'invalid local_currency';
  end if;
  if p_rate_to_default is null or p_rate_to_default <= 0 then
    raise exception 'rate_to_default must be positive';
  end if;
  if p_visibility not in ('shared', 'private') then
    raise exception 'invalid visibility';
  end if;
  if p_visibility = 'private' and p_splittable then
    raise exception 'private expense cannot be splittable';
  end if;

  select trip_id, created_by_member_id, visibility
    into v_trip_id, v_creator, v_old_vis
  from expenses
  where id = p_expense_id;

  if v_trip_id is null then
    raise exception 'expense not found';
  end if;

  perform public.validate_tz_disambig(v_trip_id, p_tz_disambig_transit_id, p_tz_disambig_side);

  -- メンバー判定と「場所を作るときの作成者」を兼ねるので id で取る。
  select id into v_my_member_id
  from trip_members
  where trip_id = v_trip_id and user_id = v_uid and left_at is null;

  if v_my_member_id is null then
    raise exception 'not an active member of this trip' using errcode = '42501';
  end if;

  select exists (
    select 1 from trip_members
    where id = v_creator and user_id = v_uid
  ) into v_is_creator;

  if (v_old_vis = 'private' or p_visibility = 'private') and not v_is_creator then
    raise exception 'not allowed to edit this expense' using errcode = '42501';
  end if;

  select exists (
    select 1 from trip_members
    where id = p_payer_member_id
      and trip_id = v_trip_id
      and left_at is null
  ) into v_payer_ok;
  if not v_payer_ok then
    raise exception 'payer is not an active member of this trip';
  end if;

  select key into v_category_key
  from expense_categories
  where id = p_category_id
    and trip_id = v_trip_id;
  if not found then
    raise exception 'category does not belong to this trip';
  end if;

  -- 初めてその場所を登録するときだけ、費用カテゴリから既定アイコンを当てる
  -- （create_expense と同じ考え方。既存の場所には影響しない）。
  v_suggest_icon := public.default_place_icon_for_expense_category(v_category_key);
  if v_suggest_icon is not null then
    if p_place ? 'google' and coalesce(p_place -> 'google' ->> 'icon', '') = '' then
      p_place := jsonb_set(p_place, '{google,icon}', to_jsonb(v_suggest_icon));
    elsif p_place ? 'freetext' and coalesce(p_place -> 'freetext' ->> 'icon', '') = '' then
      p_place := jsonb_set(p_place, '{freetext,icon}', to_jsonb(v_suggest_icon));
    end if;
  end if;

  v_place_id := public.resolve_place_spec(v_trip_id, v_my_member_id, p_place);

  update expenses
  set local_price     = p_local_price,
      local_currency  = p_local_currency,
      rate_to_default = p_rate_to_default,
      category_id     = p_category_id,
      payer_member_id = p_payer_member_id,
      visibility      = p_visibility,
      splittable      = p_splittable,
      split_everyone  = (not p_splittable or p_split_everyone),
      note            = nullif(trim(coalesce(p_note, '')), ''),
      paid_at         = coalesce(p_paid_at, paid_at),
      tz_disambig_transit_id = p_tz_disambig_transit_id,
      tz_disambig_side       = p_tz_disambig_side,
      place_id        = v_place_id
  where id = p_expense_id;

  delete from expense_splits where expense_id = p_expense_id;
  -- 「全員で割り勘」は split_everyone が持つ。対象の行は「一部の人」の
  -- ときだけ入れる。**行が無いことに意味を持たせない**（0行＝全員、という
  -- 推測をやめた。予定の participants_everyone と同じ形）。
  if p_splittable and not p_split_everyone then
    if p_split_member_ids is null
       or array_length(p_split_member_ids, 1) is null then
      raise exception 'custom split members must not be empty';
    end if;
    foreach v_split_member_id in array p_split_member_ids loop
      if not exists (
        select 1 from trip_members
        where id = v_split_member_id
          and trip_id = v_trip_id
          and left_at is null
      ) then
        raise exception 'split member % is not an active member of this trip',
          v_split_member_id;
      end if;
      insert into expense_splits (expense_id, member_id)
      values (p_expense_id, v_split_member_id)
      on conflict do nothing;
    end loop;
  end if;

  update trips set last_activity_at = now() where id = v_trip_id;
end;
$$;

grant execute on function public.create_expense(text, numeric, text, numeric, uuid, uuid, text, boolean, text, timestamp without time zone, boolean, uuid[], jsonb, uuid, text) to authenticated;
grant execute on function public.update_expense(uuid, numeric, text, numeric, uuid, uuid, text, boolean, text, timestamp without time zone, boolean, uuid[], jsonb, uuid, text) to authenticated;
