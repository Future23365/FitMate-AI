import * as React from "react";
import { Loader2Icon } from "lucide-react";

import { cn } from "@/lib/utils";

type SpinnerSize = "sm" | "md" | "lg";

const spinnerSizeClass: Record<SpinnerSize, string> = {
  sm: "size-4",
  md: "size-5",
  lg: "size-6",
};

export interface SpinnerProps extends React.ComponentProps<"span"> {
  label?: string;
  showLabel?: boolean;
  size?: SpinnerSize;
}

// Spinner 统一承载可见加载态，避免业务组件重复拼接旋转图标和无障碍文本。
function Spinner({
  className,
  label = "正在加载",
  showLabel = false,
  size = "md",
  ...props
}: SpinnerProps) {
  return (
    <span
      aria-label={label}
      className={cn("inline-flex items-center justify-center gap-2 text-primary", className)}
      role="status"
      {...props}
    >
      <Loader2Icon aria-hidden="true" className={cn("animate-spin", spinnerSizeClass[size])} />
      {showLabel ? <span>{label}</span> : <span className="sr-only">{label}</span>}
    </span>
  );
}

export { Spinner };
