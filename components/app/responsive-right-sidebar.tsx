"use client";

import {
  useMemo,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

const defaultRightSidebarWidth = 320;

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

function createMotionReadyStore() {
  let isMotionReady = false;
  const subscribers = new Set<() => void>();

  return {
    subscribe(onStoreChange: () => void) {
      subscribers.add(onStoreChange);
      const frameId = window.requestAnimationFrame(() => {
        isMotionReady = true;
        subscribers.forEach((subscriber) => subscriber());
      });

      return () => {
        window.cancelAnimationFrame(frameId);
        subscribers.delete(onStoreChange);
      };
    },
    getSnapshot() {
      return isMotionReady;
    },
    getServerSnapshot() {
      return false;
    },
  };
}

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
  const motionReadyStore = useMemo(() => createMotionReadyStore(), []);
  const portalRoot = useSyncExternalStore(
    subscribePortalRoot,
    getPortalRootSnapshot,
    getPortalRootServerSnapshot,
  );
  const isMotionReady = useSyncExternalStore(
    motionReadyStore.subscribe,
    motionReadyStore.getSnapshot,
    motionReadyStore.getServerSnapshot,
  );
  const style = getResponsiveRightSidebarStyle(width);
  const sidebar = (
    <aside
      aria-label={label}
      className={`responsive-right-sidebar app-shell-glass fixed right-0 top-0 z-30 flex h-screen flex-col border-l border-line/70 shadow-nav ${
        isMotionReady ? "responsive-right-sidebar-motion-ready" : ""
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
