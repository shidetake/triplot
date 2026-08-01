-- フライト照会の応答キャッシュ。
--
-- 無料枠が月300照会（1照会あたり最悪3リクエスト）なので、同じ便を何度も引く
-- 経路を潰しておく。効くのは主に2つ:
--   - 旅行のメンバー全員がそれぞれ同じ便を開く（人数分そのまま倍になる）
--   - 予定を編集し直すたびに同じ便名で引き直す
--
-- **中身は上流の生の応答**（Edge Function は薄い中継で、解析はクライアント側の
-- packages/shared が行う）。だからキーは「上流のどの呼び出しか」でよく、
-- triplot 側のドメインには依存しない。
--
-- **RLS を有効にしてポリシーを1つも置かない** = 誰も直接読めない。書き読みする
-- のは service_role で動く Edge Function だけ（service_role は RLS を迂回する）。
-- 利用者に見せる必要が無いデータをうっかり公開しないための既定。

create table flight_api_cache (
  -- 上流呼び出しの識別子。"flight:ZG002:2026-08-05" / "dates:ZG002"
  cache_key   text primary key,
  payload     jsonb not null,
  fetched_at  timestamptz not null default now()
);

comment on table flight_api_cache is
  'フライト照会APIの応答キャッシュ。Edge Function 専用（RLS でポリシー無し＝直接アクセス不可）';

alter table flight_api_cache enable row level security;

-- 期限切れの掃除用。TTL の判定は Edge Function 側（用途で長さが違うため）。
create index flight_api_cache_fetched_at_idx on flight_api_cache (fetched_at);
