import { describe, expect, it } from "vitest";

import { buildReceiptPrompt } from "./prompt";

describe("buildReceiptPrompt", () => {
  it("件名と本文を埋め込む", () => {
    const out = buildReceiptPrompt({ subject: "Your receipt", text: "Total $14.40" });
    expect(out).toContain("件名: Your receipt");
    expect(out).toContain("本文:");
    expect(out).toContain("Total $14.40");
  });

  it("件名が空なら (なし) と表示する", () => {
    const out = buildReceiptPrompt({ subject: "  ", text: "x" });
    expect(out).toContain("件名: (なし)");
  });
});
