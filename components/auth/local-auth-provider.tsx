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
  clearLocalAnonymousCredential,
  readLocalAnonymousCredential,
  writeLocalAnonymousCredential,
} from "@/lib/client/auth/local-auth-storage";

type LocalAuthUser = {
  id: string;
  displayName?: string | null;
};

type LocalAuthStatus = "checking" | "authenticated" | "unauthenticated" | "authenticating";

type LocalAnonymousSessionResponse = {
  ok: boolean;
  token?: string;
  expiresAt?: string;
  user?: LocalAuthUser;
};

type LocalAuthContextValue = {
  status: LocalAuthStatus;
  user: LocalAuthUser | null;
  resetLocalUser: () => void;
};

const LocalAuthContext = createContext<LocalAuthContextValue | null>(null);

export function useLocalAuth() {
  const context = useContext(LocalAuthContext);

  if (!context) {
    throw new Error("useLocalAuth must be used inside LocalAuthProvider.");
  }

  return context;
}

// LocalAuthProvider 是应用级鉴权闸门，避免侧栏和页面在匿名身份确认前请求私有 API。
export function LocalAuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<LocalAuthStatus>("checking");
  const [user, setUser] = useState<LocalAuthUser | null>(null);
  const isBlocked = status === "checking" || status === "unauthenticated" || status === "authenticating";

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      const credential = readLocalAnonymousCredential();

      if (!credential) {
        setStatus("unauthenticated");
        return;
      }

      const session = await requestLocalAnonymousSession(credential.token);

      if (cancelled) {
        return;
      }

      if (session.ok && session.token && session.user) {
        writeLocalAnonymousCredential({ token: session.token, expiresAt: session.expiresAt });
        setUser(session.user);
        setStatus("authenticated");
        return;
      }

      clearLocalAnonymousCredential();
      setUser(null);
      setStatus("unauthenticated");
    }

    void restoreSession();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function handleAuthRequired() {
      clearLocalAnonymousCredential();
      setUser(null);
      setStatus("unauthenticated");
    }

    window.addEventListener("fitmate:auth-required", handleAuthRequired);

    return () => {
      window.removeEventListener("fitmate:auth-required", handleAuthRequired);
    };
  }, []);

  const contextValue = useMemo<LocalAuthContextValue>(() => ({
    status,
    user,
    resetLocalUser() {
      clearLocalAnonymousCredential();
      setUser(null);
      setStatus("unauthenticated");
      window.dispatchEvent(new Event("fitmate:auth-required"));
    },
  }), [status, user]);

  async function createSession() {
    setStatus("authenticating");
    const session = await requestLocalAnonymousSession();

    if (session.ok && session.token && session.user) {
      writeLocalAnonymousCredential({ token: session.token, expiresAt: session.expiresAt });
      setUser(session.user);
      setStatus("authenticated");
      return;
    }

    clearLocalAnonymousCredential();
    setUser(null);
    setStatus("unauthenticated");
  }

  return (
    <LocalAuthContext.Provider value={contextValue}>
      {isBlocked ? (
        <LocalAnonymousGate
          isAuthenticating={status === "authenticating"}
          isChecking={status === "checking"}
          onContinue={createSession}
        />
      ) : children}
    </LocalAuthContext.Provider>
  );
}

function LocalAnonymousGate({
  isAuthenticating,
  isChecking,
  onContinue,
}: {
  isAuthenticating: boolean;
  isChecking: boolean;
  onContinue: () => void;
}) {
  return (
    <main className="app-mesh-bg relative min-h-dvh text-ink">
      <Dialog open>
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
              当前浏览器会自动创建并保存一个本地匿名用户，用于隔离聊天、训练编排和训练日历数据。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              className="w-full"
              disabled={isChecking || isAuthenticating}
              onClick={onContinue}
              size="lg"
              type="button"
            >
              {isChecking ? "正在恢复..." : isAuthenticating ? "正在进入..." : "继续使用 FitMate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

async function requestLocalAnonymousSession(token?: string): Promise<LocalAnonymousSessionResponse> {
  const headers = new Headers();

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch("/api/auth/local-anonymous", {
    method: "POST",
    headers,
  });

  if (!response.ok) {
    return { ok: false };
  }

  return response.json().catch(() => ({ ok: false }));
}
