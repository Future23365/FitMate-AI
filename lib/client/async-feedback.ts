"use client";

import { toast } from "sonner";

import { ClientRequestError } from "@/lib/client/http/client-request";

type AsyncToastMessage<T> = string | ((value: T) => string | null | undefined);
type AsyncToastErrorMessage = string | ((error: unknown) => string | null | undefined);

export type AsyncToastOptions<T = unknown> = {
  /** 同一业务操作使用稳定 id，避免重复堆叠或串台。 */
  id: string;
  /** 请求开始后展示的用户可见加载文案。 */
  loading: string;
  /** 操作成功后的文案；省略时会关闭 loading toast。 */
  success?: AsyncToastMessage<T>;
  /** 操作失败后的文案；省略时使用安全的通用错误映射。 */
  error?: AsyncToastErrorMessage;
  /** 延迟展示 loading，主要用于用户可见读请求降噪。 */
  delayMs?: number;
  /** loading 已展示时的最短可见时间。 */
  minVisibleMs?: number;
  /** AbortError 默认只关闭 loading，不展示失败提示。 */
  silentOnAbort?: boolean;
};

export type AsyncToastLifecycle<T = unknown> = {
  start: () => void;
  success: (value?: T) => void;
  error: (error: unknown) => void;
  dismiss: () => void;
  run: <Result extends T>(action: () => Promise<Result>) => Promise<Result>;
};

const activeToastTokens = new Map<string, symbol>();

// async feedback helper 只负责用户可见异步反馈，不替代 clientRequest 的 HTTP 合同和错误解析。
export function createAsyncToastLifecycle<T = unknown>(
  options: AsyncToastOptions<T>,
): AsyncToastLifecycle<T> {
  const token = Symbol(options.id);
  const delayMs = Math.max(0, options.delayMs ?? 0);
  const minVisibleMs = Math.max(0, options.minVisibleMs ?? 350);
  const silentOnAbort = options.silentOnAbort ?? true;
  let loadingVisibleAt: number | null = null;
  let delayTimer: ReturnType<typeof setTimeout> | null = null;
  let settleTimer: ReturnType<typeof setTimeout> | null = null;

  function isActive() {
    return activeToastTokens.get(options.id) === token;
  }

  function clearTimers() {
    if (delayTimer) {
      clearTimeout(delayTimer);
      delayTimer = null;
    }

    if (settleTimer) {
      clearTimeout(settleTimer);
      settleTimer = null;
    }
  }

  function showLoading() {
    if (!isActive()) {
      return;
    }

    loadingVisibleAt = Date.now();
    toast.loading(options.loading, { id: options.id });
  }

  function scheduleSettle(callback: () => void) {
    if (!isActive()) {
      return;
    }

    if (delayTimer) {
      clearTimeout(delayTimer);
      delayTimer = null;
    }

    if (loadingVisibleAt === null) {
      callback();
      return;
    }

    const elapsedMs = Date.now() - loadingVisibleAt;
    const remainingMs = Math.max(0, minVisibleMs - elapsedMs);

    if (remainingMs === 0) {
      callback();
      return;
    }

    settleTimer = setTimeout(() => {
      if (isActive()) {
        callback();
      }
    }, remainingMs);
  }

  function finish(callback: () => void) {
    scheduleSettle(() => {
      if (!isActive()) {
        return;
      }

      callback();
      activeToastTokens.delete(options.id);
    });
  }

  function start() {
    clearTimers();
    activeToastTokens.set(options.id, token);
    loadingVisibleAt = null;

    if (delayMs > 0) {
      delayTimer = setTimeout(showLoading, delayMs);
      return;
    }

    showLoading();
  }

  function success(value?: T) {
    finish(() => {
      const message = resolveAsyncToastMessage(options.success, value as T);

      if (message) {
        toast.success(message, { id: options.id });
        return;
      }

      toast.dismiss(options.id);
    });
  }

  function error(errorValue: unknown) {
    if (silentOnAbort && isAbortLikeError(errorValue)) {
      dismiss();
      return;
    }

    finish(() => {
      toast.error(resolveAsyncToastErrorMessage(errorValue, options.error), { id: options.id });
    });
  }

  function dismiss() {
    if (!isActive()) {
      return;
    }

    clearTimers();
    toast.dismiss(options.id);
    activeToastTokens.delete(options.id);
  }

  async function run<Result extends T>(action: () => Promise<Result>) {
    start();

    try {
      const result = await action();
      success(result);
      return result;
    } catch (errorValue) {
      error(errorValue);
      throw errorValue;
    }
  }

  return {
    start,
    success,
    error,
    dismiss,
    run,
  };
}

export function runWithAsyncToast<T>(
  options: AsyncToastOptions<T>,
  action: () => Promise<T>,
) {
  return createAsyncToastLifecycle(options).run(action);
}

export function dismissAsyncToast(id: string) {
  activeToastTokens.delete(id);
  toast.dismiss(id);
}

export function isAbortLikeError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  return (error as { name?: unknown }).name === "AbortError";
}

export function resolveAsyncToastErrorMessage(error: unknown, override?: AsyncToastErrorMessage) {
  const overrideMessage = resolveAsyncToastMessage(override, error);

  if (overrideMessage) {
    return overrideMessage;
  }

  if (error instanceof ClientRequestError && error.message) {
    return error.message;
  }

  if (isAbortLikeError(error)) {
    return "请求已取消。";
  }

  return "操作失败，请稍后重试。";
}

function resolveAsyncToastMessage<T>(
  message: AsyncToastMessage<T> | undefined,
  value: T,
) {
  if (!message) {
    return undefined;
  }

  return typeof message === "function" ? message(value) ?? undefined : message;
}
