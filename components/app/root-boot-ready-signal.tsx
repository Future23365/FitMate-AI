"use client";

import { useEffect } from "react";

type RootBootWindow = Window & {
  __FITMATE_APP_READY__?: boolean;
  __FITMATE_REMOVE_BOOT_NOTICE__?: () => void;
};

// RootBootReadySignal 标记客户端已经完成首轮挂载，用来收起独立于 React bundle 的慢加载提示。
export function RootBootReadySignal() {
  useEffect(() => {
    const bootWindow = window as RootBootWindow;

    bootWindow.__FITMATE_APP_READY__ = true;
    bootWindow.__FITMATE_REMOVE_BOOT_NOTICE__?.();
  }, []);

  return null;
}
