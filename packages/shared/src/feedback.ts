import { z } from "zod";

// ユーザーフィードバック（不具合報告・要望）の契約。書き込みは /api/feedback
// （web/RN 共通の単一経路）で、この Zod スキーマが入力の単一の真実。
// locale は受付確認メールの言語（web は useLocale()、RN は端末ロケールを送る）。
//
// platform/viewport/timezone/theme はバグ再現用の診断情報（ユーザーには見せず自動収集。
// docs/design/feedback.md 参照）。app_version はサーバ側（API route）で埋めるのでここには
// 含めない。

export const FEEDBACK_KINDS = ["bug", "feature"] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

export const FEEDBACK_PLATFORMS = ["web", "ios", "android"] as const;
export type FeedbackPlatform = (typeof FEEDBACK_PLATFORMS)[number];

export const FEEDBACK_BODY_MAX = 2000;

export const feedbackInputSchema = z.object({
  kind: z.enum(FEEDBACK_KINDS),
  body: z.string().trim().min(1).max(FEEDBACK_BODY_MAX),
  path: z.string().max(500).nullish(),
  locale: z.enum(["ja", "en"]).default("ja"),
  platform: z.enum(FEEDBACK_PLATFORMS).default("web"),
  viewport: z.string().max(20).nullish(),
  timezone: z.string().max(100).nullish(),
  theme: z.enum(["light", "dark"]).nullish(),
});

export type FeedbackInput = z.infer<typeof feedbackInputSchema>;
