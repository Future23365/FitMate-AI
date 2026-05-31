import React from "react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
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

  it("keeps the shadcn/Radix overlay with state-driven animations", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        Dialog,
        { open: true },
        React.createElement(DialogOverlay),
      ),
    );

    expect(html).toContain("data-slot=\"dialog-overlay\"");
    expect(html).toContain("fixed inset-0 z-50");
    expect(html).toContain("bg-black/50");
    expect(html).toContain("data-[state=open]:animate-in");
    expect(html).toContain("data-[state=closed]:animate-out");
  });

  it("keeps the shadcn CLI generated Radix import and motion classes", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../components/ui/dialog.tsx", import.meta.url)),
      "utf8",
    );

    expect(source).toContain('import { Dialog as DialogPrimitive } from "radix-ui"');
    expect(source).toContain("data-[state=open]:animate-in");
    expect(source).toContain("data-[state=closed]:animate-out");
    expect(source).toContain("data-[state=open]:fade-in-0");
    expect(source).toContain("data-[state=closed]:fade-out-0");
    expect(source).toContain("data-[state=open]:zoom-in-95");
    expect(source).toContain("data-[state=closed]:zoom-out-95");
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
