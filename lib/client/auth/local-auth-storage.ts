"use client";

export const localAnonymousCredentialStorageKey = "fitmate.localAuth.v1";
export const localAnonymousCredentialVersion = 1;

export type LocalAnonymousCredential = {
  version: typeof localAnonymousCredentialVersion;
  token: string;
  expiresAt?: string;
};

// 本地匿名凭证工具只处理浏览器存储格式，不解析 token payload。
export function readLocalAnonymousCredential(): LocalAnonymousCredential | null {
  if (typeof window === "undefined" || !window.localStorage) {
    return null;
  }

  const rawValue = window.localStorage.getItem(localAnonymousCredentialStorageKey);

  if (!rawValue) {
    return null;
  }

  try {
    const parsedValue = JSON.parse(rawValue) as Partial<LocalAnonymousCredential>;

    if (parsedValue.version !== localAnonymousCredentialVersion || typeof parsedValue.token !== "string") {
      clearLocalAnonymousCredential();
      return null;
    }

    return {
      version: localAnonymousCredentialVersion,
      token: parsedValue.token,
      expiresAt: typeof parsedValue.expiresAt === "string" ? parsedValue.expiresAt : undefined,
    };
  } catch {
    clearLocalAnonymousCredential();
    return null;
  }
}

export function writeLocalAnonymousCredential(input: Omit<LocalAnonymousCredential, "version">) {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }

  window.localStorage.setItem(
    localAnonymousCredentialStorageKey,
    JSON.stringify({
      version: localAnonymousCredentialVersion,
      token: input.token,
      expiresAt: input.expiresAt,
    }),
  );
}

export function clearLocalAnonymousCredential() {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }

  window.localStorage.removeItem(localAnonymousCredentialStorageKey);
}
