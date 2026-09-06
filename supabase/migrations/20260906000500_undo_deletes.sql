-- 「元に戻す」（アンドゥ）のための復元。
--
-- 消したものを戻すのに**逆操作をやり直さない**。消す時に元の姿を丸ごと控えて
-- おいて、それをそのまま書き戻す（docs/ui-guidelines.md「元に戻す（アンドゥ）
-- の作り方」）。作り直すと id が変わり、参照していたもの（予約TODO ↔ 予定、
-- いいね）が静かに切れる。

-- 取り込みの破棄を戻す。
--
-- 破棄は行を消さず status を 'dismissed' にするだけなので、戻すのは
-- 'pending' に書き戻すこと。あわせて、全部解決したことでメール自体に付いた
-- 決着（confirmed/dismissed）も外す — 未確定が残っている状態に戻るのだから、
-- メールは 'extracted'（受信箱に出る）でなければ辻褄が合わない。
--
-- **メール本文（raw / body_text）は戻らない。** 全部解決した時点で消している
-- （保持の最小化。finalize_inbound_email_if_resolved 参照）。下書きの中身は
-- payload に残っているので画面で見えるものは全部戻り、失うのは合体の突き合わせに
-- 使う元本文だけ。
create or replace function public.restore_inbound_drafts(p_ids uuid[])
  returns void
  language plpgsql security definer set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  update inbound_drafts d
  set status = 'pending'
  from inbound_emails e
  where d.id = any(p_ids) and d.status = 'dismissed'
    and e.id = d.email_id and e.user_id = v_uid;

  -- 未確定が戻ったメールは受信箱に出る状態へ。
  update inbound_emails e
  set status = 'extracted'
  where e.user_id = v_uid
    and e.status in ('confirmed', 'dismissed')
    and exists (
      select 1 from inbound_drafts d
      where d.email_id = e.id and d.id = any(p_ids) and d.status = 'pending'
    );
end;
$$;

-- メール単位の破棄が、どの下書きを 'dismissed' にしたかを返すようにする
-- （戻す時にその id だけを戻すため。全部の dismissed を戻すと、以前に自分で
-- 破棄したものまで蘇る）。戻り値を無視する呼び出しはそのまま動く。
drop function if exists public.dismiss_inbound_email(uuid);
create or replace function public.dismiss_inbound_email(p_id uuid)
  returns uuid[]
  language plpgsql security definer set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_ids uuid[];
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  with updated as (
    update inbound_drafts d
    set status = 'dismissed'
    from inbound_emails e
    where d.email_id = p_id and d.status = 'pending'
      and e.id = d.email_id and e.user_id = v_uid
    returning d.id
  )
  select coalesce(array_agg(id), '{}'::uuid[]) into v_ids from updated;
  perform finalize_inbound_email_if_resolved(p_id, v_uid);
  return v_ids;
end;
$$;

-- TODO を消して、元の姿を返す。
--
-- 戻す側が要るものを全部ここで渡す（呼び出し側が列を知らなくて済む＝列が
-- 増えた時に控え忘れが起きない）。いいね（todo_likes）は FK の cascade で
-- 一緒に消えるので、誰が押していたかも一緒に控える。
create or replace function public.delete_todo_returning(p_id uuid)
  returns jsonb
  language plpgsql security definer set search_path to 'public'
as $$
declare
  v_uid   uuid := auth.uid();
  v_todo  jsonb;
  v_likes jsonb;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select to_jsonb(t) into v_todo
  from todos t
  where t.id = p_id and is_active_trip_member(t.trip_id);
  if v_todo is null then
    raise exception 'todo not found' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(l.member_id), '[]'::jsonb) into v_likes
  from todo_likes l where l.todo_id = p_id;

  delete from todos where id = p_id;
  return jsonb_build_object('todo', v_todo, 'likes', v_likes);
end;
$$;

-- delete_todo_returning が返した控えをそのまま書き戻す（id も created_at も
-- 元のまま＝予定に紐づく予約TODO の参照も、並び順も保たれる）。
create or replace function public.restore_todo(p_snapshot jsonb)
  returns void
  language plpgsql security definer set search_path to 'public'
as $$
declare
  v_uid  uuid := auth.uid();
  v_todo jsonb := p_snapshot -> 'todo';
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if v_todo is null then
    raise exception 'invalid snapshot';
  end if;
  if not is_active_trip_member(v_todo ->> 'trip_id') then
    raise exception 'not a trip member' using errcode = '42501';
  end if;

  insert into todos
  select * from jsonb_populate_record(null::todos, v_todo)
  on conflict (id) do nothing;

  insert into todo_likes (todo_id, member_id)
  select (v_todo ->> 'id')::uuid, m::uuid
  from jsonb_array_elements_text(coalesce(p_snapshot -> 'likes', '[]'::jsonb)) m
  on conflict do nothing;
end;
$$;

revoke all on function public.restore_inbound_drafts(uuid[]) from public;
grant execute on function public.restore_inbound_drafts(uuid[]) to authenticated;
revoke all on function public.dismiss_inbound_email(uuid) from public;
grant execute on function public.dismiss_inbound_email(uuid) to authenticated;
revoke all on function public.delete_todo_returning(uuid) from public;
grant execute on function public.delete_todo_returning(uuid) to authenticated;
revoke all on function public.restore_todo(jsonb) from public;
grant execute on function public.restore_todo(jsonb) to authenticated;
