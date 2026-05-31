"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { SymbolIcon } from "@/components/app/symbol-icon";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  localAuthRequiredEventName,
  type LocalAuthRequiredDetail,
  type LocalAuthRequiredReason,
} from "@/lib/client/auth/local-auth-events";
import {
  requestLocalAnonymousSession,
  resetLocalAnonymousSession,
  type LocalAuthUser,
} from "@/lib/client/auth/local-auth-session";
import {
  initialLocalAuthRuntimeState,
  localAuthAuthenticatingState,
  localAuthFailedState,
  localAuthRequiredState,
  localAuthResetState,
  localAuthResettingState,
  localAuthSucceededState,
  type LocalAuthStatus,
} from "@/lib/client/auth/local-auth-state";

type LocalAuthContextValue = {
  status: LocalAuthStatus;
  user: LocalAuthUser | null;
  resetLocalUser: () => Promise<void>;
};

const LocalAuthContext = createContext<LocalAuthContextValue | null>(null);

export function useLocalAuth() {
  const context = useContext(LocalAuthContext);

  if (!context) {
    throw new Error("useLocalAuth must be used inside LocalAuthProvider.");
  }

  return context;
}

// LocalAuthProvider 只协调未认证后的局部 Dialog，不再在应用启动时阻塞页面渲染。
export function LocalAuthProvider({ children }: { children: React.ReactNode }) {
  const [authState, setAuthState] = useState(initialLocalAuthRuntimeState);

  useEffect(() => {
    function handleAuthRequired(event: Event) {
      const detail = event instanceof CustomEvent
        ? (event.detail as Partial<LocalAuthRequiredDetail> | undefined)
        : undefined;

      setAuthState((current) => localAuthRequiredState(current, detail?.reason ?? "unauthenticated"));
    }

    window.addEventListener(localAuthRequiredEventName, handleAuthRequired);

    return () => {
      window.removeEventListener(localAuthRequiredEventName, handleAuthRequired);
    };
  }, []);

  const contextValue = useMemo<LocalAuthContextValue>(() => ({
    status: authState.status,
    user: authState.user,
    async resetLocalUser() {
      setAuthState(localAuthResettingState);

      try {
        await resetLocalAnonymousSession();
      } finally {
        setAuthState(localAuthResetState());
      }
    },
  }), [authState.status, authState.user]);

  async function createSession() {
    setAuthState(localAuthAuthenticatingState);
    const session = await requestLocalAnonymousSession();

    if (session.ok && session.user) {
      setAuthState((current) => localAuthSucceededState(current, session.user as LocalAuthUser));
      return;
    }

    setAuthState(localAuthFailedState);
  }

  return (
    <LocalAuthContext.Provider value={contextValue}>
      {children}
      <LocalAnonymousDialog
        authRequiredReason={authState.authRequiredReason}
        open={authState.authDialogOpen}
        onOpenChange={(open) => setAuthState((current) => ({ ...current, authDialogOpen: open }))}
        onContinue={createSession}
        isAuthenticating={authState.status === "authenticating"}
      />
    </LocalAuthContext.Provider>
  );
}

function LocalAnonymousDialog({
  authRequiredReason,
  isAuthenticating,
  onContinue,
  onOpenChange,
  open,
}: {
  authRequiredReason: LocalAuthRequiredReason | null;
  isAuthenticating: boolean;
  onContinue: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-soft text-primary ring-1 ring-primary/10">
          <SymbolIcon className="text-[28px]" filled>
            person
          </SymbolIcon>
        </div>
        <DialogHeader>
          <p className="text-sm font-bold text-primary">本地匿名身份</p>
          <DialogTitle className="text-2xl font-extrabold text-ink">
            继续使用 FitMate
          </DialogTitle>
          <DialogDescription className="text-sm font-semibold leading-6 text-muted">
            {getLocalAnonymousDialogDescription(authRequiredReason)}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            disabled={isAuthenticating}
            onClick={() => onOpenChange(false)}
            type="button"
            variant="secondary"
          >
            暂不登录
          </Button>
          <Button
            disabled={isAuthenticating}
            onClick={onContinue}
            type="button"
          >
            {isAuthenticating ? "正在进入..." : "继续使用 FitMate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function getLocalAnonymousDialogDescription(reason: LocalAuthRequiredReason | null) {
  if (reason === "expired_token" || reason === "invalid_token" || reason === "user_not_found") {
    return "当前浏览器的本地匿名会话已失效。继续后会重新建立一个本地匿名用户，用于隔离聊天、训练编排和训练日历数据。";
  }

  return "当前操作需要本地匿名用户。继续后会在当前浏览器建立一个本地匿名会话，用于隔离聊天、训练编排和训练日历数据。";
}
