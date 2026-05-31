import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Dialog, DialogContent, DialogOverlay } from "@/components/ui/dialog";

describe("Dialog", () => {
  it("uses Radix portal rendering for dialog content", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        Dialog,
        { open: true },
        React.createElement(DialogContent, null, "内容"),
      ),
    );

    expect(html).toBe("");
  });

  it("keeps the shadcn/Radix overlay above sidebars with state-driven animations", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        Dialog,
        { open: true },
        React.createElement(DialogOverlay),
      ),
    );

    expect(html).toContain("data-slot=\"dialog-overlay\"");
    expect(html).toContain("fixed inset-0 z-[100]");
    expect(html).toContain("data-[state=open]:animate-in");
    expect(html).toContain("data-[state=closed]:animate-out");
  });

  it("does not render dialog content when closed before hydration", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        Dialog,
        { open: false },
        React.createElement(DialogContent, null, "内容"),
      ),
    );

    expect(html).toBe("");
  });
});
