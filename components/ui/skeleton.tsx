import * as React from "react";

import { cn } from "@/lib/utils";

// Skeleton 统一承载轻量加载占位，避免各组件重复手写 animate-pulse 样式。
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded-md bg-surface-container", className)}
      {...props}
    />
  );
}

export { Skeleton };
