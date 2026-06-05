"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

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

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setIsClientMounted(true);
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

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

  if (!isClientMounted) {
    return null;
  }

  return createPortal(
    <div
      aria-label={ariaLabel}
      aria-modal="true"
      className={`fixed inset-0 z-50 flex justify-end bg-black/20 backdrop-blur-[1px] drawer-backdrop-transition ${
        isOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
      }`}
      onClick={onClose}
      role="dialog"
    >
      <aside
        className={`flex h-full w-full flex-col shadow-2xl drawer-panel-transition ${widthClassName} ${panelClassName} ${
          isOpen ? "translate-x-0" : "translate-x-full"
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
