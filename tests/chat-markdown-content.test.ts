import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MarkdownContent } from "@/features/chat/components/markdown-content";

describe("MarkdownContent", () => {
  it("renders single-tilde numeric ranges as plain text instead of strikethrough", () => {
    const html = renderMarkdown("- 每组做 8~12 次，完成 2~3 组，组间休息 60 秒");

    expect(html).toContain("每组做 8~12 次，完成 2~3 组");
    expect(html).not.toContain("<del");
  });

  it("downgrades markdown structures that are unsafe for chat bubbles", () => {
    const html = renderMarkdown([
      "# 训练建议 😄",
      "",
      "---",
      "",
      "~~不要显示删除线~~",
      "",
      "| 项目 | 数值 |",
      "|---|---|",
      "| 组数 | 3 |",
      "",
      "- [x] 已完成",
      "",
      "```json",
      "{\"sets\":3}",
      "```",
      "",
      "脚注引用[^1]",
      "",
      "[^1]: 这是一条脚注",
      "",
      "<hr><div>raw html</div>",
    ].join("\n"));

    expect(html).toContain("训练建议 😄");
    expect(html).toContain("不要显示删除线");
    expect(html).toContain("组数");
    expect(html).toContain("已完成");
    expect(html).toContain("{&quot;sets&quot;:3}");
    expect(html).not.toContain("<h1");
    expect(html).not.toContain("<hr");
    expect(html).not.toContain("<del");
    expect(html).not.toContain("<table");
    expect(html).not.toContain("<input");
    expect(html).not.toContain("<pre");
    expect(html).not.toContain("<section");
    expect(html).not.toContain("<sup");
    expect(html).not.toContain("<div>raw html</div>");
  });
});

function renderMarkdown(content: string) {
  return renderToStaticMarkup(createElement(MarkdownContent, { content }));
}
