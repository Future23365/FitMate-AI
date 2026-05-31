"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

type DialogContextValue = {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
};

const DialogContext = React.createContext<DialogContextValue | null>(null);

// Dialog 是本项目的 shadcn 弹窗源码层实现，默认在当前容器内渲染，避免变成全局页面遮罩。
function Dialog({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}) {
  React.useEffect(() => {
    const handleOpenChange = onOpenChange;

    if (!open || !handleOpenChange) {
      return;
    }

    const closeDialog = handleOpenChange;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeDialog(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onOpenChange, open]);

  return (
    <DialogContext.Provider value={{ open, onOpenChange }}>
      {children}
    </DialogContext.Provider>
  );
}

function useDialogContext() {
  const context = React.useContext(DialogContext);

  if (!context) {
    throw new Error("Dialog components must be used inside Dialog.");
  }

  return context;
}

function DialogContent({
  className,
  children,
  ...props
}: React.ComponentProps<"section">) {
  const { onOpenChange, open } = useDialogContext();

  if (!open) {
    return null;
  }

  return (
    <div
      className="fitmate-dialog-root absolute inset-0 z-20 flex items-center justify-center px-lg py-xl"
      data-state="open"
    >
      <DialogOverlay
        data-state="open"
        onClick={() => onOpenChange?.(false)}
      />
      <section
        aria-modal="true"
        className={cn(
          "fitmate-dialog-content relative z-10 grid w-full max-w-lg gap-4 rounded-xl border border-border bg-card p-6 text-card-foreground shadow-lift outline-none",
          className,
        )}
        data-state="open"
        role="dialog"
        {...props}
      >
        {children}
      </section>
    </div>
  );
}

function DialogOverlay({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("fitmate-dialog-overlay absolute inset-0 bg-white/70 backdrop-blur-sm", className)}
      data-slot="dialog-overlay"
      {...props}
    />
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex flex-col gap-1.5 text-left", className)}
      data-slot="dialog-header"
      {...props}
    />
  );
}

function DialogTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <h2
      className={cn("text-title-lg font-semibold text-foreground", className)}
      data-slot="dialog-title"
      {...props}
    />
  );
}

function DialogDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      className={cn("text-body-sm text-muted-foreground", className)}
      data-slot="dialog-description"
      {...props}
    />
  );
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
      data-slot="dialog-footer"
      {...props}
    />
  );
}

export {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
};
