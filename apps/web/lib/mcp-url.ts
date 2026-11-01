// AI から見た MCP の入口の URL。本番はこの web そのもの（/api/mcp）。staging は
// web が Vercel の保護の内側で外の AI から届かないので、Supabase の Edge Function
// （mcp）が中継し、その URL を MCP_RESOURCE_URL に置く（docs/design/mcp.md）。
//
// MCP の入口（認可の情報に載せる URL）と、案内のページ（利用者にコピーしてもらう
// URL）の両方がここを使う。食い違うと、案内した URL でつないだ AI が認可で迷う。
export function mcpUrl(origin: string): string {
  return process.env.MCP_RESOURCE_URL ?? `${origin}/api/mcp`;
}
