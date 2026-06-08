"use client";

import { useEffect, useState } from "react";

// useDebouncedValue 延迟提交快速变化的客户端值，避免输入驱动的请求逐字触发。
export function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedValue(value), Math.max(0, delayMs));

    return () => window.clearTimeout(timer);
  }, [delayMs, value]);

  return debouncedValue;
}
