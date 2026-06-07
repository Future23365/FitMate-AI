"use client";

import { useLayoutEffect } from "react";

type RootBootWindow = Window & {
  __FITMATE_APP_READY__?: boolean;
  __FITMATE_REMOVE_BOOT_NOTICE__?: () => void;
};

// RootBootReadySignal 标记客户端首轮挂载已到达提交阶段，用来尽早收起独立于 React bundle 的慢加载提示。
export function RootBootReadySignal() {
  useLayoutEffect(() => {
    const bootWindow = window as RootBootWindow;

    bootWindow.__FITMATE_APP_READY__ = true;
    bootWindow.__FITMATE_REMOVE_BOOT_NOTICE__?.();
  }, []);

  return null;
}
