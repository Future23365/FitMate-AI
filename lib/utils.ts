import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// shadcn 组件共享的 className 合并入口，负责把条件类和 Tailwind 冲突类收敛为最终样式。
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
