"use client";

import type { ReactNode } from "react";

import { RightDrawer } from "./right-drawer";
import { SymbolIcon } from "./symbol-icon";

type WorkspaceRightPanelProps = {
  ariaLabel: string;
  children: ReactNode;
  isOpen: boolean;
  onClose: () => void;
  title: string;
  bodyClassName?: string;
  description?: string;
  dockedBreakpointClassName?: string;
  dockedClassName?: string;
  dockedWidthClassName?: string;
  headerExtra?: ReactNode;
  widthClassName?: string;
};

type WorkspaceRightPanelFrameProps = Pick<
  WorkspaceRightPanelProps,
  "bodyClassName" | "children" | "description" | "headerExtra" | "title"
> & {
  onClose?: () => void;
};

function WorkspaceRightPanelFrame({
  bodyClassName = "",
  children,
  description,
  headerExtra,
  onClose,
  title,
}: WorkspaceRightPanelFrameProps) {
  return (
    <>
      <div className="shrink-0 border-b border-line bg-white px-md py-md">
        <div className="flex items-start justify-between gap-md">
          <div className="min-w-0">
            <h2 className="truncate font-title-lg text-title-lg font-extrabold text-ink">
              {title}
            </h2>
            {description ? (
              <p className="mt-xs font-label-sm text-label-sm text-muted">
                {description}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-xs">
            {headerExtra}
            {onClose ? (
              <button
                aria-label="关闭辅助面板"
                className="grid h-9 w-9 place-items-center rounded-xl text-muted transition-colors hover:bg-panel-soft hover:text-primary"
                onClick={onClose}
                type="button"
              >
                <SymbolIcon className="text-[20px]">close</SymbolIcon>
              </button>
            ) : null}
          </div>
        </div>
      </div>
      <div className={`custom-scrollbar min-h-0 flex-1 overflow-y-auto p-md ${bodyClassName}`}>
        {children}
      </div>
    </>
  );
}

// WorkspaceRightPanel 统一工作区右侧辅助面板的停靠和浮出外壳，业务页只管理内容和内部状态。
export function WorkspaceRightPanel({
  ariaLabel,
  bodyClassName,
  children,
  description,
  dockedBreakpointClassName = "xl:flex",
  dockedClassName = "",
  dockedWidthClassName = "w-[var(--workspace-material-panel-width)]",
  headerExtra,
  isOpen,
  onClose,
  title,
  widthClassName = "w-full sm:w-[420px] sm:max-w-[calc(100vw-32px)]",
}: WorkspaceRightPanelProps) {
  return (
    <>
      <aside
        aria-label={ariaLabel}
        className={`app-shell-glass fixed right-0 top-0 z-30 hidden h-screen flex-col overflow-hidden border-l border-line/70 shadow-nav ${dockedWidthClassName} ${dockedBreakpointClassName} ${dockedClassName}`}
      >
        <WorkspaceRightPanelFrame
          bodyClassName={bodyClassName}
          description={description}
          headerExtra={headerExtra}
          title={title}
        >
          {children}
        </WorkspaceRightPanelFrame>
      </aside>

      <RightDrawer
        ariaLabel={ariaLabel}
        bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden"
        headerClassName="hidden"
        isOpen={isOpen}
        panelClassName="bg-white"
        widthClassName={widthClassName}
        onClose={onClose}
      >
        <WorkspaceRightPanelFrame
          bodyClassName={bodyClassName}
          description={description}
          headerExtra={headerExtra}
          title={title}
          onClose={onClose}
        >
          {children}
        </WorkspaceRightPanelFrame>
      </RightDrawer>
    </>
  );
}
