import React from "react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LocalAuthProvider } from "@/components/auth/local-auth-provider";
import SettingsPage from "@/app/settings/page";

describe("LocalAuthProvider", () => {
  it("renders the current page on first entry without opening the anonymous login dialog", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        LocalAuthProvider,
        null,
        React.createElement("main", { id: "current-page" }, "当前页面"),
      ),
    );

    expect(html).toContain("当前页面");
    expect(html).not.toContain("继续使用 FitMate");
    expect(html).not.toContain("app-mesh-bg relative min-h-dvh");
  });

  it("keeps settings reset action inside the page while relying on the provider state", () => {
    const html = renderToStaticMarkup(
      React.createElement(LocalAuthProvider, null, React.createElement(SettingsPage)),
    );

    expect(html).toContain("重置本地用户");
    expect(html).toContain("标记为软删除");
    expect(html).not.toContain("继续使用 FitMate");
  });

  it("keeps reset behind a shadcn confirmation dialog instead of calling reset directly", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../app/settings/page.tsx", import.meta.url)),
      "utf8",
    );

    expect(source).toContain("DialogContent");
    expect(source).toContain("setResetDialogOpen(true)");
    expect(source).toContain("DialogClose asChild");
    expect(source).toContain("confirmResetLocalUser");
    expect(source).toContain("await resetLocalUser()");
    expect(source).toContain("旧本地用户会被软删除");
    expect(source).toContain("restart_alt");
    expect(source).toContain("warning");
    expect(source).not.toContain("person_cancel");
    expect(source).not.toContain("onClick={resetLocalUser}");
  });
});
