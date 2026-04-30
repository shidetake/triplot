-- auth.users が作られたら public.users にも対応する行を作成する。
-- public.users.id は auth.users.id を参照しており、サインアップ時に必須。
-- is_anonymous は auth.users.is_anonymous をそのままコピー。

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, is_anonymous, display_name)
  values (
    new.id,
    coalesce(new.is_anonymous, false),
    coalesce(new.raw_user_meta_data->>'name', null)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
