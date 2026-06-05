"use client";

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { createPortal } from "react-dom";
import { Toaster as Sonner, type ToasterProps } from "sonner";

import { cn } from "@/lib/utils";

// Toaster 是 shadcn Sonner 的全局提示容器，统一承载应用级 toast 展示。
const Toaster = ({ className, position = "top-center", style, ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  const toaster = (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      position={position}
      className={cn("toaster group", className)}
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          ...style,
          zIndex: 2147483647,
        } as React.CSSProperties
      }
      {...props}
    />
  );

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(toaster, document.body);
};

export { Toaster };
