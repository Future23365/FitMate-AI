import * as React from "react";

import { cn } from "@/lib/utils";

// Input 是 shadcn 表单输入基线，统一项目的边框、焦点态和禁用态样式。
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      data-slot="input"
      type={type}
      className={cn(
        "flex h-10 w-full rounded-[var(--radius)] border border-input bg-card px-3 py-2 text-body-sm text-foreground outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/35 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
