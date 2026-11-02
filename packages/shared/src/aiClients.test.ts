import { describe, expect, it } from "vitest";

import { AI_GUIDES, aiClientName } from "./aiClients";

describe("aiClientName", () => {
  it("shows Gemini, which registers itself as Google, by its AI name", () => {
    expect(aiClientName("Google")).toBe("Gemini");
  });

  it("keeps names that already are the AI's name", () => {
    expect(aiClientName("Claude")).toBe("Claude");
    expect(aiClientName("Muse")).toBe("Muse");
  });

  it("opens Claude's add-connector screen with triplot's URL filled in", () => {
    const claude = AI_GUIDES.find((a) => a.key === "claude")!;
    expect(claude.setup!("https://triplot.app/api/mcp")).toBe(
      "https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=Triplot&connectorUrl=https%3A%2F%2Ftriplot.app%2Fapi%2Fmcp",
    );
  });

  it("returns null when the client has no name", () => {
    expect(aiClientName("")).toBeNull();
    expect(aiClientName(null)).toBeNull();
  });
});
