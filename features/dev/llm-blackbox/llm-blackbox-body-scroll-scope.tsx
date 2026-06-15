"use client";

import { useEffect } from "react";

const devLlmBlackboxBodyScrollClassName = "dev-llm-blackbox-scroll-body";

// LlmBlackboxBodyScrollScope 只在开发态黑盒审核页挂载，用路由级 body class 放开整页滚动。
export function LlmBlackboxBodyScrollScope() {
  useEffect(() => {
    document.body.classList.add(devLlmBlackboxBodyScrollClassName);

    return () => {
      document.body.classList.remove(devLlmBlackboxBodyScrollClassName);
    };
  }, []);

  return null;
}
