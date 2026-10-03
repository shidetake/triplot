# triplot 残件

このファイルは機能残件の覚え書き。完了したら該当行を消す（`[x]` のまま残さない）。

## 残件

### 14. LP 本体（コピー/動画/スクショ）
骨組み（ルート・共有ヘッダー・URL/IA）は実装済み。LP のコンテンツ制作が残。

### 16. 課金（有料プラン）
設計は [docs/design/billing.md](docs/design/billing.md)。利用枠の数え方と
実効上限（プランの上限と個別上書きの大きい方）は実装済み。残っているのは:
- プラン（無料/有料の契約状態）をユーザに持たせる（今の「プランの上限」は定数 `MONTHLY_EMAIL_CAP`）
- 課金経路（App Store / web の決済）。どちらで買っても同じ1つの権利にする
- 権利を引く1か所の入口（判定はサーバ側）
未決: どちらの経路から作るか／有料で何が変わるか（取り込みの枠だけか、機能も出し分けるか）。

### 17. TODO の旧担当者の列を消す
`todos.assignee_member_id`（2026-10-02 に入れた「担当者1人」の列）は、担当を
「未定／全員／一部」にした時点で使わなくなった。TestFlight の 1.1.0 (239)・(240)
がまだ読むので残してある。その版が使われなくなったら、migration で列と制約
（`todos_assignee_member_fkey`・`todos_private_assignee_check`・`todos_assignee_idx`）を
消し、`set_todo_assignees` と `set_event_reservation`・ゲストの切り替えで値を
合わせている箇所も外す。
