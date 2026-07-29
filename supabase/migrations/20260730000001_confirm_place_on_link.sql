-- 候補(tentative)の場所が予定・費用に紐づいたら、自動で確定に落とす。
--
-- 予定に組み込まれた時点で行くことはほぼ確定し、費用が付いたなら行くこと自体は
-- 確定している（もしくは既に行った）。実態がそうなのにユーザーが「候補 → 確定」を
-- 手で直さないといけないのは無駄なので DB 側で合わせる。
--
-- アプリ側でなくトリガーで持つ理由: place_id を書く経路が複数ある
-- （events の直 insert/update、create_expense RPC、取り込み下書きの確定、
-- 自由入力からの find_or_create_trip_freetext_place 経由の紐づけ…）。
-- どれか1つ漏らすと「紐づいているのに候補のまま」という不整合が残るので、
-- 経路に依らず効く DB 側の1箇所で担保する。
--
-- 逆方向（紐づけを外したら候補に戻す）はやらない。ユーザーが手で確定にした
-- 意思を勝手に巻き戻すことになるため。確定 → 候補 は手動操作だけ。
--
-- security definer にしているのは places の RLS を跨ぐため。紐づけを行った
-- 時点でその予定/費用と場所は同じ trip 内にあり（下で trip_id を照合）、
-- 呼び出し元はその trip のメンバーなので、権限としては過剰にならない。

create or replace function public.confirm_place_on_link()
returns trigger
language plpgsql
security definer
set search_path = public
as $body$
begin
  update places
  set tentative = false
  where id = new.place_id
    and tentative
    -- 別 trip の場所を巻き込まない保険（アプリ側は同 trip しか渡さない）。
    and trip_id = new.trip_id;
  return new;
end;
$body$;

-- `update of place_id` の列指定は UPDATE にだけ効く（INSERT は常に対象）。
-- 紐づけが変わった時だけ動かしたいので列を絞る。

drop trigger if exists trg_confirm_place_on_event_link on events;

create trigger trg_confirm_place_on_event_link
  after insert or update of place_id on events
  for each row
  when (new.place_id is not null)
  execute function public.confirm_place_on_link();

drop trigger if exists trg_confirm_place_on_expense_link on expenses;

create trigger trg_confirm_place_on_expense_link
  after insert or update of place_id on expenses
  for each row
  when (new.place_id is not null)
  execute function public.confirm_place_on_link();
