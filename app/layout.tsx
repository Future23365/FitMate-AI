import type { Metadata } from "next";
import { LocalAuthProvider } from "@/components/auth/local-auth-provider";
import { RootBootReadySignal } from "@/components/app/root-boot-ready-signal";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "FitMate AI",
  description: "AI 健身聊天助手",
};

// Material Symbols 首屏加载策略在根布局集中处理，避免 ligature 文本短暂暴露。
const materialSymbolsFontHref = "/fonts/material-symbols/MaterialSymbolsRounded%5BFILL,GRAD,opsz,wght%5D.woff2";

const materialSymbolsFontReadyScript = `
(function () {
  var root = document.documentElement;
  var attr = "data-symbol-font-ready";
  var fontQuery = '1em "Material Symbols Rounded"';
  var sampleText = "fitness_center";

  function markReady() {
    root.setAttribute(attr, "true");
  }

  function keepPending() {
    root.setAttribute(attr, "pending");
  }

  if (!("fonts" in document)) {
    markReady();
    return;
  }

  keepPending();

  document.fonts.load(fontQuery, sampleText).then(function (fonts) {
    if (fonts.length > 0) {
      markReady();
    }
  }, keepPending);

  document.fonts.ready.then(function () {
    if (document.fonts.check(fontQuery, sampleText)) {
      markReady();
    }
  }, keepPending);
})();
`.trim();

const rootBootNoticeDelayMs = 2800;

const rootBootNoticeStyles = `
#fitmate-root-boot-notice {
  position: fixed;
  top: 16px;
  left: 0;
  right: 0;
  z-index: 2147483646;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  box-sizing: border-box;
  padding: 0 16px;
  color: #172033;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  opacity: 0;
  pointer-events: none;
  transition: opacity 120ms ease;
}

#fitmate-root-boot-notice[data-visible="true"] {
  opacity: 1;
}

.fitmate-root-boot-notice__panel {
  display: flex;
  width: min(100%, 520px);
  align-items: flex-start;
  gap: 12px;
  border: 1px solid rgba(36, 89, 230, 0.18);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 18px 48px rgba(16, 24, 40, 0.12);
  padding: 16px 18px;
}

.fitmate-root-boot-notice__mark {
  display: flex;
  width: 28px;
  height: 28px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: rgba(36, 89, 230, 0.12);
  color: #2459e6;
  font-size: 16px;
  font-weight: 800;
  line-height: 1;
}

.fitmate-root-boot-notice__copy {
  min-width: 0;
}

.fitmate-root-boot-notice__title {
  margin: 0;
  color: #172033;
  font-size: 15px;
  font-weight: 800;
  line-height: 1.35;
}

.fitmate-root-boot-notice__description {
  margin: 4px 0 0;
  color: #526070;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.7;
}

@media (min-width: 768px) {
  #fitmate-root-boot-notice {
    top: 20px;
  }
}
`;

const rootBootNoticeScript = `
(function () {
  var noticeId = "fitmate-root-boot-notice";
  var readyKey = "__FITMATE_APP_READY__";
  var removeKey = "__FITMATE_REMOVE_BOOT_NOTICE__";

  window[readyKey] = false;

  function removeNotice() {
    var notice = document.getElementById(noticeId);

    if (!notice) {
      return;
    }

    if (notice.parentNode) {
      notice.parentNode.removeChild(notice);
    }
  }

  window[removeKey] = removeNotice;

  window.setTimeout(function () {
    if (window[readyKey]) {
      return;
    }

    var notice = document.getElementById(noticeId);

    if (!notice) {
      notice = document.createElement("div");
      notice.id = noticeId;
      notice.setAttribute("role", "status");
      notice.setAttribute("aria-live", "polite");
      notice.innerHTML = '<div class="fitmate-root-boot-notice__panel"><div class="fitmate-root-boot-notice__mark" aria-hidden="true">!</div><div class="fitmate-root-boot-notice__copy"><p class="fitmate-root-boot-notice__title">访问可能较慢</p><p class="fitmate-root-boot-notice__description">当前项目部署在香港服务器，<br/>如果页面长时间停留在加载状态，可能与跨境网络有关。<br/>建议使用稳定的代理环境访问。</p></div></div>';
      document.body.appendChild(notice);
    }

    window.requestAnimationFrame(function () {
      if (!window[readyKey]) {
        notice.setAttribute("data-visible", "true");
      }
    });
  }, ${rootBootNoticeDelayMs});
})();
`.trim();

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" data-symbol-font-ready="pending" suppressHydrationWarning>
      <head>
        <link
          rel="preload"
          href={materialSymbolsFontHref}
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body>
        <script
          id="fitmate-material-symbols-ready-script"
          dangerouslySetInnerHTML={{ __html: materialSymbolsFontReadyScript }}
        />
        <style
          id="fitmate-root-boot-notice-style"
          dangerouslySetInnerHTML={{ __html: rootBootNoticeStyles }}
        />
        <script
          id="fitmate-root-boot-notice-script"
          dangerouslySetInnerHTML={{ __html: rootBootNoticeScript }}
        />
        <LocalAuthProvider>
          <RootBootReadySignal />
          {children}
        </LocalAuthProvider>
        <Toaster />
      </body>
    </html>
  );
}
