// レシート本文からの「明細リンク」選別（ルールベース・純関数）。
// 方針（合意済み）: ライブ経路はルールのみ＝決定的・安い。LLM で辿るべきリンクを
// 探す/ルールを増やすのはオフライン学習で後付け（[[project_expense_import]]）。
//
// 主防御はドメイン・ホワイトリスト。ここに無いホストは fetch しない（SSRF 面を最小化）。
// 追跡ラッパー（sendgrid 等）越しの最終遷移先まで追うのは v1 では扱わず、ルール増強で対応。

// 辿ってよいレシートドメイン（suffix 一致）。オフライン学習で育てる前提の初期セット。
export const RECEIPT_LINK_HOSTS = ["squareup.com", "clover.com"] as const;

// host が許可ドメインか（完全一致 or サブドメイン）。
export function isAllowedReceiptHost(host: string): boolean {
  const h = host.toLowerCase();
  return RECEIPT_LINK_HOSTS.some(
    (allowed) => h === allowed || h.endsWith(`.${allowed}`),
  );
}

// テキスト中の http(s) URL を全部拾う（重複除去）。
export function extractUrls(text: string): string[] {
  const found = text.match(/https?:\/\/[^\s"'<>)\]]+/g) ?? [];
  // 末尾の句読点を軽く落とす
  const cleaned = found.map((u) => u.replace(/[.,;]+$/, ""));
  return [...new Set(cleaned)];
}

// LLM が報告した明細リンク(detailUrl)が「未許可ホストの自動 enrichment（第2パス）」の
// 対象か。許可ホストは第1パス（selectReceiptLinks）で取得済みなので対象外。
// fetch 側の要件に合わせ https のみ（SSRF ガードの詳細は fetchLink.ts が持つ）。
export function isUnknownReceiptHostUrl(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  return !isAllowedReceiptHost(u.hostname);
}

// 許可ドメインに該当する候補リンクだけ返す。
export function selectReceiptLinks(text: string): string[] {
  const out: string[] = [];
  for (const url of extractUrls(text)) {
    let host: string;
    try {
      const u = new URL(url);
      if (u.protocol !== "http:" && u.protocol !== "https:") continue;
      host = u.hostname;
    } catch {
      continue;
    }
    if (isAllowedReceiptHost(host)) out.push(url);
  }
  return [...new Set(out)];
}
