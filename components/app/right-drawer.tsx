"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

// 与 app/globals.css 的 .drawer-*-transition 时长保持一致，确保退出动画结束后再卸载 portal。
const drawerTransitionDurationMs = 500;

type RightDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
  ariaLabel: string;
  children: ReactNode;
  header?: ReactNode;
  footer?: ReactNode;
  widthClassName?: string;
  panelClassName?: string;
  bodyClassName?: string;
  headerClassName?: string;
  footerClassName?: string;
};

// RightDrawer 只负责右侧抽屉外壳：portal、遮罩、动画和背景锁定，不承载业务内容。
export function RightDrawer({
  isOpen,
  onClose,
  ariaLabel,
  children,
  header,
  footer,
  widthClassName = "sm:w-[460px]",
  panelClassName = "bg-slate-50",
  bodyClassName = "custom-scrollbar flex-1 overflow-y-auto",
  headerClassName = "shrink-0",
  footerClassName = "shrink-0",
}: RightDrawerProps) {
  const [isClientMounted, setIsClientMounted] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setIsClientMounted(true);
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!isClientMounted) {
      return;
    }

    if (isOpen) {
      if (shouldRender) {
        return;
      }

      const frame = window.requestAnimationFrame(() => {
        setShouldRender(true);
      });

      return () => window.cancelAnimationFrame(frame);
    }

    if (!shouldRender) {
      return;
    }

    const timer = window.setTimeout(() => {
      setShouldRender(false);
    }, drawerTransitionDurationMs);

    return () => window.clearTimeout(timer);
  }, [isClientMounted, isOpen, shouldRender]);

  useEffect(() => {
    if (!isClientMounted || !shouldRender) {
      return;
    }

    if (!isOpen) {
      const frame = window.requestAnimationFrame(() => {
        setIsVisible(false);
      });

      return () => window.cancelAnimationFrame(frame);
    }

    const frame = window.requestAnimationFrame(() => {
      setIsVisible(true);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [isClientMounted, isOpen, shouldRender]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";
    document.body.classList.add("drawer-open");

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.classList.remove("drawer-open");
    };
  }, [isOpen]);

  if (!isClientMounted || !shouldRender) {
    return null;
  }

  return createPortal(
    <div
      aria-label={ariaLabel}
      aria-modal="true"
      className={`fixed inset-0 z-50 flex justify-end bg-black/20 backdrop-blur-[1px] drawer-backdrop-transition ${
        isVisible ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
      }`}
      onClick={onClose}
      role="dialog"
    >
      <aside
        className={`flex h-full w-full flex-col shadow-2xl drawer-panel-transition ${widthClassName} ${panelClassName} ${
          isVisible ? "translate-x-0" : "translate-x-full"
        }`}
        onClick={(event) => event.stopPropagation()}
      >
        {header ? <div className={headerClassName}>{header}</div> : null}
        <div className={bodyClassName}>{children}</div>
        {footer ? <div className={footerClassName}>{footer}</div> : null}
      </aside>
    </div>,
    document.body,
  );
}
