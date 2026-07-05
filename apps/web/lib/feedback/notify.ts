import { createTranslator } from "next-intl";
import { Resend } from "resend";

import type { FeedbackInput } from "@triplot/shared/feedback";
import en from "@triplot/shared/messages/en.json";
import ja from "@triplot/shared/messages/ja.json";

// フィードバック投稿のメール通知（Resend）。/api/feedback の after() から呼ぶ。
// best-effort: 送信失敗は投稿の成否に影響させない（ログのみ）。
// RESEND_API_KEY 未設定の環境（ローカル・プレビュー）ではスキップ＝メール無しでも機能は完結。

const FROM = "triplot <noreply@triplot.app>";
const MESSAGES = { ja, en } as const;

async function send(
  resend: Resend,
  opts: { to: string; subject: string; text: string },
): Promise<void> {
  try {
    const { error } = await resend.emails.send({ from: FROM, ...opts });
    if (error) console.error("[feedback] mail send failed", error.message);
  } catch (e) {
    console.error("[feedback] mail send failed", e);
  }
}

export async function notifyFeedback(params: {
  input: FeedbackInput;
  // 投稿者の auth email（受付確認の宛先）。無ければ確認メールは送らない。
  userEmail: string | null;
  // バグ再現用の診断情報。管理者向け通知にのみ含める（投稿者向けには不要）。
  userAgent: string | null;
  appVersion: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;
  const resend = new Resend(apiKey);
  const { input, userEmail, userAgent, appVersion } = params;

  const sends: Promise<void>[] = [];

  // 投稿者への受付確認（内容の控え）。言語は投稿時の locale。文面はアプリ内コピーと
  // 同じ共有カタログ（packages/shared/messages）の feedback.email* を使う。
  if (userEmail) {
    const t = createTranslator({
      locale: input.locale,
      messages: MESSAGES[input.locale],
      namespace: "feedback",
    });
    const kindLabel = input.kind === "bug" ? t("kindBug") : t("kindFeature");
    const text = [
      t("emailIntro"),
      "",
      `${t("kindLabel")}: ${kindLabel}`,
      input.body,
      "",
      t("emailOutro"),
    ].join("\n");
    sends.push(
      send(resend, { to: userEmail, subject: t("emailSubject"), text }),
    );
  }

  // 管理者への新着通知。日本語固定（管理者=日本語話者）なので意図的にカタログ外。
  const adminTo = process.env.FEEDBACK_NOTIFY_EMAIL;
  if (adminTo) {
    const kindLabel = input.kind === "bug" ? "不具合" : "要望";
    const diagnostics = [
      input.platform,
      input.viewport,
      input.timezone,
      input.theme,
      appVersion,
    ]
      .filter(Boolean)
      .join(" / ");
    const lines = [
      `種別: ${kindLabel}`,
      `投稿者: ${userEmail ?? "(email 不明)"}`,
      ...(input.path ? [`画面: ${input.path}`] : []),
      `環境: ${diagnostics}`,
      ...(userAgent ? [`UA: ${userAgent}`] : []),
      "",
      input.body,
    ];
    sends.push(
      send(resend, {
        to: adminTo,
        subject: `【triplot】新しいフィードバック: ${kindLabel}`,
        text: lines.join("\n"),
      }),
    );
  }

  await Promise.all(sends);
}
