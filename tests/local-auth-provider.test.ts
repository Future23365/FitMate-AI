import React from "react";
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
    expect(html).toContain("不删除服务器上旧匿名用户的数据");
    expect(html).not.toContain("继续使用 FitMate");
  });
});
