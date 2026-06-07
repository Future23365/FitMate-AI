import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ClientRequestError } from "@/lib/client/http/client-request";
import {
  createAsyncToastLifecycle,
  isAbortLikeError,
  resolveAsyncToastErrorMessage,
  runWithAsyncToast,
} from "@/lib/client/async-feedback";

const toastMock = vi.hoisted(() => ({
  dismiss: vi.fn(),
  error: vi.fn(),
  loading: vi.fn(),
  success: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: toastMock,
}));

describe("async feedback toast helper", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-07T10:00:00.000Z"));
    Object.values(toastMock).forEach((mock) => mock.mockClear());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("updates the same toast id from loading to success", async () => {
    const result = await runWithAsyncToast(
      {
        id: "workout-save",
        loading: "正在保存训练编排...",
        success: (value: { title: string }) => `已保存：${value.title}`,
        minVisibleMs: 0,
      },
      async () => ({ title: "上肢训练" }),
    );

    expect(result).toEqual({ title: "上肢训练" });
    expect(toastMock.loading).toHaveBeenCalledWith("正在保存训练编排...", { id: "workout-save" });
    expect(toastMock.success).toHaveBeenCalledWith("已保存：上肢训练", { id: "workout-save" });
  });

  it("maps ClientRequestError to a safe user-visible error message", async () => {
    const requestError = new ClientRequestError("保存失败，请稍后重试。", 500, { message: "debug" });

    await expect(
      runWithAsyncToast(
        {
          id: "workout-save",
          loading: "正在保存训练编排...",
          minVisibleMs: 0,
        },
        async () => {
          throw requestError;
        },
      ),
    ).rejects.toBe(requestError);

    expect(toastMock.error).toHaveBeenCalledWith("保存失败，请稍后重试。", { id: "workout-save" });
  });

  it("delays loading toast for noisy visible read requests", () => {
    const lifecycle = createAsyncToastLifecycle({
      id: "exercise-list",
      loading: "正在加载动作列表...",
      delayMs: 500,
    });

    lifecycle.start();
    vi.advanceTimersByTime(499);
    expect(toastMock.loading).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(toastMock.loading).toHaveBeenCalledWith("正在加载动作列表...", { id: "exercise-list" });
  });

  it("keeps an already visible loading toast for the configured minimum time", async () => {
    await runWithAsyncToast(
      {
        id: "slow-command",
        loading: "正在处理...",
        success: "处理完成",
        minVisibleMs: 800,
      },
      async () => "ok",
    );

    expect(toastMock.success).not.toHaveBeenCalled();

    vi.advanceTimersByTime(799);
    expect(toastMock.success).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(toastMock.success).toHaveBeenCalledWith("处理完成", { id: "slow-command" });
  });

  it("dismisses AbortError without reporting a failure by default", async () => {
    const abortError = Object.assign(new Error("aborted"), { name: "AbortError" });

    await expect(
      runWithAsyncToast(
        {
          id: "chat-send",
          loading: "正在发送消息...",
          minVisibleMs: 0,
        },
        async () => {
          throw abortError;
        },
      ),
    ).rejects.toBe(abortError);

    expect(isAbortLikeError(abortError)).toBe(true);
    expect(toastMock.dismiss).toHaveBeenCalledWith("chat-send");
    expect(toastMock.error).not.toHaveBeenCalled();
  });

  it("isolates concurrent lifecycles and ignores stale completion for the same id", () => {
    const first = createAsyncToastLifecycle({
      id: "exercise-detail",
      loading: "正在读取动作详情 A...",
      success: "A 完成",
      minVisibleMs: 0,
    });
    const second = createAsyncToastLifecycle({
      id: "exercise-detail",
      loading: "正在读取动作详情 B...",
      success: "B 完成",
      minVisibleMs: 0,
    });

    first.start();
    second.start();
    first.success();

    expect(toastMock.loading).toHaveBeenNthCalledWith(1, "正在读取动作详情 A...", { id: "exercise-detail" });
    expect(toastMock.loading).toHaveBeenNthCalledWith(2, "正在读取动作详情 B...", { id: "exercise-detail" });
    expect(toastMock.success).not.toHaveBeenCalled();

    second.success();
    expect(toastMock.success).toHaveBeenCalledWith("B 完成", { id: "exercise-detail" });
  });

  it("keeps different toast ids independent", () => {
    const list = createAsyncToastLifecycle({
      id: "exercise-list",
      loading: "正在加载动作列表...",
      success: "动作列表已更新",
      minVisibleMs: 0,
    });
    const save = createAsyncToastLifecycle({
      id: "routine-save",
      loading: "正在保存训练编排...",
      success: "训练编排已保存",
      minVisibleMs: 0,
    });

    list.start();
    save.start();
    list.success();

    expect(toastMock.success).toHaveBeenCalledWith("动作列表已更新", { id: "exercise-list" });
    expect(toastMock.dismiss).not.toHaveBeenCalledWith("routine-save");

    save.success();
    expect(toastMock.success).toHaveBeenCalledWith("训练编排已保存", { id: "routine-save" });
  });

  it("falls back to a generic message for unknown errors", () => {
    expect(resolveAsyncToastErrorMessage(new Error("Internal stack trace"))).toBe("操作失败，请稍后重试。");
  });
});
