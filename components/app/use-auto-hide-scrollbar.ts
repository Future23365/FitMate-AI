"use client";

import { useEffect, useRef } from "react";

// useAutoHideScrollbar 负责在真实滚动时短暂显示主体滚动条，停止后恢复弱化状态。
export function useAutoHideScrollbar<T extends HTMLElement>() {
  const scrollRef = useRef<T | null>(null);

  useEffect(() => {
    const element = scrollRef.current;

    if (!element) {
      return;
    }

    const scrollElement = element;
    let hideTimer = 0;

    function showScrollbar() {
      scrollElement.classList.add("is-scrolling");
      window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => {
        scrollElement.classList.remove("is-scrolling");
      }, 700);
    }

    scrollElement.addEventListener("scroll", showScrollbar, { passive: true });

    return () => {
      window.clearTimeout(hideTimer);
      scrollElement.removeEventListener("scroll", showScrollbar);
      scrollElement.classList.remove("is-scrolling");
    };
  }, []);

  return scrollRef;
}
