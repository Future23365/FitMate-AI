"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

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
    <main className="app-mesh-bg fixed inset-0 flex items-center justify-center px-lg text-ink">
      <section
        aria-modal="true"
        className="w-full max-w-md rounded-xl border border-line/80 bg-white p-xl shadow-lift"
        role="dialog"
      >
        <div className="mb-lg flex h-12 w-12 items-center justify-center rounded-xl bg-primary-soft text-xl font-extrabold text-primary">
          FM
        </div>
        <p className="text-sm font-bold text-primary">本地匿名身份</p>
        <h1 className="mt-2 text-2xl font-extrabold text-ink">继续使用 FitMate</h1>
        <p className="mt-sm text-sm font-semibold leading-6 text-muted">
          当前浏览器会自动创建并保存一个本地匿名用户，用于隔离聊天、训练编排和训练日历数据。
        </p>
        <button
          className="mt-lg flex w-full items-center justify-center rounded-xl bg-primary px-5 py-3 text-sm font-extrabold text-white shadow-card transition-colors hover:bg-primary-deep disabled:cursor-not-allowed disabled:bg-muted"
          disabled={isChecking || isAuthenticating}
          onClick={onContinue}
          type="button"
        >
          {isChecking ? "正在恢复..." : isAuthenticating ? "正在进入..." : "继续使用 FitMate"}
        </button>
      </section>
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
