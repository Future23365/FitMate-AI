"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type FocusEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

const defaultRightSidebarWidth = 320;

type SidebarFocusSource = "pointer" | "keyboard";

type ResponsiveRightSidebarProps = {
  children: ReactNode;
  className?: string;
  label?: string;
  width?: number;
};

const subscribePortalRoot = (onStoreChange: () => void) => {
  const frameId = window.requestAnimationFrame(onStoreChange);

  return () => {
    window.cancelAnimationFrame(frameId);
  };
};

const getPortalRootSnapshot = () => {
  if (typeof document === "undefined") {
    return null;
  }

  return document.body;
};

const getPortalRootServerSnapshot = () => {
  return null;
};

// getResponsiveRightSidebarStyle 提供页面级宽度变量，保证主内容避让和右侧栏本体使用同一事实。
export function getResponsiveRightSidebarStyle(width = defaultRightSidebarWidth) {
  return {
    "--responsive-right-sidebar-width": `${width}px`,
  } as CSSProperties;
}

// ResponsiveRightSidebar 通过 portal 脱离页面主体缩放层，统一右侧栏的占位与浮层行为。
export function ResponsiveRightSidebar({
  children,
  className = "",
  label,
  width = defaultRightSidebarWidth,
}: ResponsiveRightSidebarProps) {
  const sidebarRef = useRef<HTMLElement | null>(null);
  const sidebarFocusSourceRef = useRef<SidebarFocusSource>("pointer");
  const [isExpanded, setIsExpanded] = useState(false);
  const [isInteractionReady, setIsInteractionReady] = useState(false);
  const [isMotionReady, setIsMotionReady] = useState(false);
  const portalRoot = useSyncExternalStore(
    subscribePortalRoot,
    getPortalRootSnapshot,
    getPortalRootServerSnapshot,
  );

  // 首次挂到 body 后先固定收起，再开放交互，避免刷新恢复焦点或初始命中 hover 直接展开。
  useEffect(() => {
    if (!portalRoot) {
      return;
    }

    let secondFrameId = 0;
    const firstFrameId = window.requestAnimationFrame(() => {
      secondFrameId = window.requestAnimationFrame(() => {
        const activeElement = document.activeElement;

        if (
          activeElement instanceof HTMLElement &&
          sidebarRef.current?.contains(activeElement)
        ) {
          activeElement.blur();
        }

        setIsInteractionReady(true);
        setIsMotionReady(true);
      });
    });

    return () => {
      window.cancelAnimationFrame(firstFrameId);
      if (secondFrameId) {
        window.cancelAnimationFrame(secondFrameId);
      }
    };
  }, [portalRoot]);

  // 侧边栏同时服务鼠标 hover 和键盘访问；这里记录焦点来源，避免鼠标点击后的残留焦点锁住展开态。
  useEffect(() => {
    function handleGlobalKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Tab") {
        sidebarFocusSourceRef.current = "keyboard";
      }
    }

    function handleGlobalPointerDown() {
      sidebarFocusSourceRef.current = "pointer";
    }

    document.addEventListener("keydown", handleGlobalKeyDown, true);
    document.addEventListener("pointerdown", handleGlobalPointerDown, true);

    return () => {
      document.removeEventListener("keydown", handleGlobalKeyDown, true);
      document.removeEventListener("pointerdown", handleGlobalPointerDown, true);
    };
  }, []);

  function expandSidebar() {
    if (isInteractionReady) {
      setIsExpanded(true);
    }
  }

  function hasFocusInsideSidebar() {
    const activeElement = document.activeElement;
    return activeElement instanceof Node && Boolean(sidebarRef.current?.contains(activeElement));
  }

  function blurPointerFocusInsideSidebar() {
    const activeElement = document.activeElement;
    if (
      activeElement instanceof HTMLElement &&
      sidebarRef.current?.contains(activeElement)
    ) {
      activeElement.blur();
    }
  }

  function handleSidebarPointerLeave() {
    if (!isInteractionReady) {
      return;
    }

    if (sidebarFocusSourceRef.current === "keyboard" && hasFocusInsideSidebar()) {
      return;
    }

    blurPointerFocusInsideSidebar();
    setIsExpanded(false);
  }

  function handleSidebarFocus() {
    if (!isInteractionReady || sidebarFocusSourceRef.current !== "keyboard") {
      return;
    }

    setIsExpanded(true);
  }

  function handleSidebarBlur(event: FocusEvent<HTMLElement>) {
    if (!isInteractionReady) {
      return;
    }

    const nextFocusedElement = event.relatedTarget;
    if (
      nextFocusedElement instanceof Node &&
      event.currentTarget.contains(nextFocusedElement)
    ) {
      return;
    }

    setIsExpanded(false);
  }

  const style = getResponsiveRightSidebarStyle(width);
  const sidebar = (
    <aside
      aria-label={label}
      onBlurCapture={handleSidebarBlur}
      onFocusCapture={handleSidebarFocus}
      onPointerDown={expandSidebar}
      onPointerEnter={expandSidebar}
      onPointerLeave={handleSidebarPointerLeave}
      onPointerMove={expandSidebar}
      ref={sidebarRef}
      className={`responsive-right-sidebar app-right-sidebar-surface fixed right-0 top-0 z-30 flex h-screen flex-col border-l border-line/70 shadow-nav ${
        isMotionReady ? "responsive-right-sidebar-motion-ready" : ""
      } ${
        isExpanded ? "responsive-right-sidebar-expanded" : ""
      } ${className}`}
      style={style}
    >
      {children}
    </aside>
  );

  if (!portalRoot) {
    return null;
  }

  return createPortal(sidebar, portalRoot);
}
