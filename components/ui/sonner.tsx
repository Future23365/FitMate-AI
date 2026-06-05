"use client";

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Toaster as Sonner, type ToasterProps } from "sonner";

import { cn } from "@/lib/utils";

type HydrationListener = () => void;

let isClientHydrated = false;
const hydrationListeners = new Set<HydrationListener>();

function subscribeToClientHydration(listener: HydrationListener) {
  hydrationListeners.add(listener);

  if (!isClientHydrated) {
    isClientHydrated = true;
    queueMicrotask(() => {
      hydrationListeners.forEach((currentListener) => currentListener());
    });
  }

  return () => {
    hydrationListeners.delete(listener);
  };
}

function getClientHydrationSnapshot() {
  return isClientHydrated;
}

function getServerHydrationSnapshot() {
  return false;
}

// Toaster 是 shadcn Sonner 的全局提示容器，统一承载应用级 toast 展示。
const Toaster = ({ className, position = "top-center", style, ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();
  const hasHydrated = useSyncExternalStore(
    subscribeToClientHydration,
    getClientHydrationSnapshot,
    getServerHydrationSnapshot,
  );

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

  if (!hasHydrated || typeof document === "undefined") {
    return null;
  }

  return createPortal(toaster, document.body);
};

export { Toaster };
