import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

const TestDialog = Dialog as React.ComponentType<React.PropsWithChildren<{ open: boolean }>>;

describe("Dialog", () => {
  it("renders animated open-state markup for local shadcn dialog content", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        TestDialog,
        { open: true },
        React.createElement(
          DialogContent,
          null,
          React.createElement(DialogTitle, null, "标题"),
        ),
      ),
    );

    expect(html).toContain("data-state=\"open\"");
    expect(html).toContain("fixed inset-0 z-[100]");
    expect(html).toContain("fitmate-dialog-overlay");
    expect(html).toContain("fitmate-dialog-content");
  });

  it("does not render dialog content when closed before hydration", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        TestDialog,
        { open: false },
        React.createElement(DialogContent, null, "内容"),
      ),
    );

    expect(html).toBe("");
  });
});
