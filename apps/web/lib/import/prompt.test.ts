import { describe, expect, it } from "vitest";

import { buildImportPrompt, IMPORT_SYSTEM_PROMPT } from "./prompt";

describe("buildImportPrompt", () => {
  it("件名と本文を埋め込む", () => {
    const out = buildImportPrompt({ subject: "Your receipt", text: "Total $14.40" });
    expect(out).toContain("件名: Your receipt");
    expect(out).toContain("本文:");
    expect(out).toContain("Total $14.40");
  });

  it("件名が空なら (なし) と表示する", () => {
    const out = buildImportPrompt({ subject: "  ", text: "x" });
    expect(out).toContain("件名: (なし)");
  });
});

describe("IMPORT_SYSTEM_PROMPT", () => {
  it("費用と予定の両方の抽出指示を含む", () => {
    expect(IMPORT_SYSTEM_PROMPT).toContain("【費用】");
    expect(IMPORT_SYSTEM_PROMPT).toContain("【予定】");
    expect(IMPORT_SYSTEM_PROMPT).toContain("transit");
    expect(IMPORT_SYSTEM_PROMPT).toContain("IANA");
  });
});
