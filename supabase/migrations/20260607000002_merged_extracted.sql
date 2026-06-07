-- ────────────────────────────────────────────────────────────
-- マージ：各メールの「自分の」抽出は保持し、合体結果は別カラムに持つ
-- ────────────────────────────────────────────────────────────
-- これまで合体時にターゲットの extracted を合体結果で上書きしていたため、元の
-- 個別データ（例: 利用28.98）が見えず split 判断ができなかった。各行の extracted
-- は「自分の」値のまま保持し、合体結果は merged_extracted に入れる。表示/確定で
-- 使う実効値 = merged_extracted ?? extracted。

alter table inbound_emails add column merged_extracted jsonb;

-- split（誤マージ取り消し）: 子を独立下書きに戻し、親の合体結果をクリア
-- （親は自分の extracted に戻る＝二重計上を防ぐ）。
-- ※ 親に他の子が残る多重マージでは合体が失われるが、稀なので MVP では許容。
create or replace function public.unmerge_inbound_email(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $body$
declare
  v_uid    uuid := auth.uid();
  v_parent uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select merged_into into v_parent
  from inbound_emails
  where id = p_id and user_id = v_uid and status = 'merged';
  if v_parent is null then
    return;
  end if;
  update inbound_emails
  set status = 'extracted', merged_into = null
  where id = p_id and user_id = v_uid;
  update inbound_emails
  set merged_extracted = null
  where id = v_parent and user_id = v_uid;
end;
$body$;

revoke all on function public.unmerge_inbound_email(uuid) from public;
grant execute on function public.unmerge_inbound_email(uuid) to authenticated;
