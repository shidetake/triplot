-- 場所の削除を「元に戻す」ためのもの。
--
-- **場所は消すと参照も一緒に失う。** 予定の出発地・到着地と費用の場所は
-- `on delete set null` なので、消した瞬間に黙って空になる。行を書き戻すだけでは
-- 戻ったことにならないので、**誰が参照していたかも一緒に控える**
-- （docs/ui-guidelines.md「元に戻す（アンドゥ）の作り方」＝逆操作ではなく復元）。

create or replace function public.delete_place_returning(p_id uuid)
  returns jsonb
  language plpgsql security definer set search_path to 'public'
as $$
declare
  v_uid   uuid := auth.uid();
  v_place jsonb;
  v_starts jsonb;
  v_ends   jsonb;
  v_exps   jsonb;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select to_jsonb(p) into v_place
  from places p
  where p.id = p_id and is_active_trip_member(p.trip_id);
  if v_place is null then
    raise exception 'place not found' using errcode = '42501';
  end if;

  -- 出発地と到着地は別々に控える（同じ予定が両方でこの場所を指していることが
  -- あり、まとめると片方しか戻せない）。
  select coalesce(jsonb_agg(id), '[]'::jsonb) into v_starts
  from events where start_place_id = p_id;
  select coalesce(jsonb_agg(id), '[]'::jsonb) into v_ends
  from events where end_place_id = p_id;
  select coalesce(jsonb_agg(id), '[]'::jsonb) into v_exps
  from expenses where place_id = p_id;

  delete from places where id = p_id;
  return jsonb_build_object(
    'place', v_place,
    'eventStarts', v_starts,
    'eventEnds', v_ends,
    'expenses', v_exps
  );
end;
$$;

-- delete_place_returning が返した控えをそのまま書き戻す（id も created_at も
-- 元のまま＝場所そのものだけでなく、指していた予定・費用の参照も戻る）。
create or replace function public.restore_place(p_snapshot jsonb)
  returns void
  language plpgsql security definer set search_path to 'public'
as $$
declare
  v_uid   uuid := auth.uid();
  v_place jsonb := p_snapshot -> 'place';
  v_id    uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if v_place is null then
    raise exception 'invalid snapshot';
  end if;
  if not is_active_trip_member(v_place ->> 'trip_id') then
    raise exception 'not a trip member' using errcode = '42501';
  end if;
  v_id := (v_place ->> 'id')::uuid;

  insert into places
  select * from jsonb_populate_record(null::places, v_place)
  on conflict (id) do nothing;

  -- 参照を指し直す。**この場所を指していた行だけ**を戻す（消した後に別の場所へ
  -- 付け替えられていたら、そちらを上書きしない）。
  update events set start_place_id = v_id
  where start_place_id is null
    and id in (
      select (x)::uuid from jsonb_array_elements_text(
        coalesce(p_snapshot -> 'eventStarts', '[]'::jsonb)) x
    );
  update events set end_place_id = v_id
  where end_place_id is null
    and id in (
      select (x)::uuid from jsonb_array_elements_text(
        coalesce(p_snapshot -> 'eventEnds', '[]'::jsonb)) x
    );
  update expenses set place_id = v_id
  where place_id is null
    and id in (
      select (x)::uuid from jsonb_array_elements_text(
        coalesce(p_snapshot -> 'expenses', '[]'::jsonb)) x
    );
end;
$$;

revoke all on function public.delete_place_returning(uuid) from public;
grant execute on function public.delete_place_returning(uuid) to authenticated;
revoke all on function public.restore_place(jsonb) from public;
grant execute on function public.restore_place(jsonb) to authenticated;
