"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

const transitionDurationMs = 220;

export function RouteTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const previousPathRef = useRef(pathname);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [overlayKey, setOverlayKey] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);

  // 路由切换只触发短遮罩，不再缩放页面内容，避免标题重影和缩放错觉。
  useLayoutEffect(() => {
    if (pathname === previousPathRef.current) {
      return;
    }

    previousPathRef.current = pathname;

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    setOverlayKey((key) => key + 1);
    setIsTransitioning(true);

    timeoutRef.current = setTimeout(() => {
      setIsTransitioning(false);
      timeoutRef.current = null;
    }, transitionDurationMs);
  }, [pathname]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="route-transition-root" aria-live="off">
      <div className="route-transition-page">
        {children}
      </div>
      {isTransitioning ? (
        <div key={overlayKey} className="route-transition-overlay" aria-hidden="true" />
      ) : null}
    </div>
  );
}
