import { describe, expect, it } from "vitest";

import { aiClientName } from "./aiClients";

describe("aiClientName", () => {
  it("shows Gemini, which registers itself as Google, by its AI name", () => {
    expect(aiClientName("Google")).toBe("Gemini");
  });

  it("keeps names that already are the AI's name", () => {
    expect(aiClientName("Claude")).toBe("Claude");
    expect(aiClientName("Muse")).toBe("Muse");
  });

  it("returns null when the client has no name", () => {
    expect(aiClientName("")).toBeNull();
    expect(aiClientName(null)).toBeNull();
  });
});
