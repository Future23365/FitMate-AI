"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

type RouteSnapshot = {
  key: string;
  content: ReactNode;
};

const transitionDurationMs = 320;

export function RouteTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialRoute: RouteSnapshot = {
    key: pathname,
    content: children,
  };
  const activeRef = useRef<RouteSnapshot>({
    key: pathname,
    content: children,
  });
  const [activeRoute, setActiveRoute] = useState<RouteSnapshot>(initialRoute);
  const [exitingRoute, setExitingRoute] = useState<RouteSnapshot | null>(null);

  // 保留上一帧路由快照，给退出页留出缩小后退动画时间。
  useLayoutEffect(() => {
    if (pathname === activeRef.current.key) {
      return;
    }

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    const leavingRoute = activeRef.current;
    const enteringRoute: RouteSnapshot = {
      key: pathname,
      content: children,
    };

    activeRef.current = enteringRoute;
    setExitingRoute(leavingRoute);
    setActiveRoute(enteringRoute);

    timeoutRef.current = setTimeout(() => {
      setExitingRoute(null);
      timeoutRef.current = null;
    }, transitionDurationMs);
  }, [children, pathname]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="route-transition-root" aria-live="off">
      <div key={`active-${activeRoute.key}`} className="route-transition-page route-transition-page-active">
        {activeRoute.content}
      </div>
      {exitingRoute ? (
        <div key={`exit-${exitingRoute.key}`} className="route-transition-page route-transition-page-exit">
          {exitingRoute.content}
        </div>
      ) : null}
    </div>
  );
}
