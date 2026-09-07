-- 費用の削除を「元に戻す」ためのもの。
--
-- 費用は消すと**ぶら下がっているものが2種類**一緒に動く:
--   - 割り勘の対象（expense_splits）は cascade で消える
--   - この費用として確定した取り込みの下書き（inbound_drafts.expense_id）は
--     `on delete set null` で黙って紐づけが外れる
-- 行を書き戻すだけでは戻ったことにならないので、どちらも控える
-- （docs/ui-guidelines.md「元に戻す（アンドゥ）の作り方」＝逆操作ではなく復元）。

create or replace function public.delete_expense_returning(p_id uuid)
  returns jsonb
  language plpgsql security definer set search_path to 'public'
as $$
declare
  v_uid     uuid := auth.uid();
  v_expense jsonb;
  v_splits  jsonb;
  v_drafts  jsonb;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select to_jsonb(e) into v_expense
  from expenses e
  where e.id = p_id and is_active_trip_member(e.trip_id);
  if v_expense is null then
    raise exception 'expense not found' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(s.member_id), '[]'::jsonb) into v_splits
  from expense_splits s where s.expense_id = p_id;
  select coalesce(jsonb_agg(d.id), '[]'::jsonb) into v_drafts
  from inbound_drafts d where d.expense_id = p_id;

  delete from expenses where id = p_id;
  return jsonb_build_object(
    'expense', v_expense,
    'splits', v_splits,
    'drafts', v_drafts
  );
end;
$$;

create or replace function public.restore_expense(p_snapshot jsonb)
  returns void
  language plpgsql security definer set search_path to 'public'
as $$
declare
  v_uid     uuid := auth.uid();
  v_expense jsonb := p_snapshot -> 'expense';
  v_id      uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if v_expense is null then
    raise exception 'invalid snapshot';
  end if;
  if not is_active_trip_member(v_expense ->> 'trip_id') then
    raise exception 'not a trip member' using errcode = '42501';
  end if;
  v_id := (v_expense ->> 'id')::uuid;

  insert into expenses
  select * from jsonb_populate_record(null::expenses, v_expense)
  on conflict (id) do nothing;

  insert into expense_splits (expense_id, member_id)
  select v_id, m::uuid
  from jsonb_array_elements_text(coalesce(p_snapshot -> 'splits', '[]'::jsonb)) m
  on conflict do nothing;

  -- 取り込みの下書きの紐づけを戻す。**まだ空のままの行だけ**（消した後に別の
  -- 費用へ結び直されていたら、そちらを上書きしない）。
  update inbound_drafts set expense_id = v_id
  where expense_id is null
    and id in (
      select (x)::uuid from jsonb_array_elements_text(
        coalesce(p_snapshot -> 'drafts', '[]'::jsonb)) x
    );
end;
$$;

revoke all on function public.delete_expense_returning(uuid) from public;
grant execute on function public.delete_expense_returning(uuid) to authenticated;
revoke all on function public.restore_expense(jsonb) from public;
grant execute on function public.restore_expense(jsonb) to authenticated;
