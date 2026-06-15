import type { LlmBlackboxReviewRun } from "@/features/dev/llm-blackbox/review-state";

export const llmBlackboxReviewRunsStorageKey = "fitmate.dev.llmBlackbox.reviewRuns.v1";
export const llmBlackboxReviewRunsMaxCount = 8;
export const llmBlackboxReviewRunsMaxSerializedLength = 480_000;

type ReviewStorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

// readLlmBlackboxReviewRuns 从当前浏览器会话恢复临时批次结果，解析失败时返回空列表。
export function readLlmBlackboxReviewRuns(storage = getSessionStorage()): LlmBlackboxReviewRun[] {
  if (!storage) {
    return [];
  }

  const raw = storage.getItem(llmBlackboxReviewRunsStorageKey);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);

    return Array.isArray(parsed)
      ? parsed.filter(isReviewRunRecord)
      : [];
  } catch {
    return [];
  }
}

// writeLlmBlackboxReviewRuns 写入最近若干批次，并在超出容量时从旧结果开始清理。
export function writeLlmBlackboxReviewRuns(
  runs: LlmBlackboxReviewRun[],
  storage = getSessionStorage(),
) {
  if (!storage) {
    return [];
  }

  const pruned = pruneLlmBlackboxReviewRuns(runs);
  storage.setItem(llmBlackboxReviewRunsStorageKey, JSON.stringify(pruned));

  return pruned;
}

export function clearLlmBlackboxReviewRuns(storage = getSessionStorage()) {
  storage?.removeItem(llmBlackboxReviewRunsStorageKey);
}

export function pruneLlmBlackboxReviewRuns(runs: LlmBlackboxReviewRun[]) {
  let pruned = [...runs]
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, llmBlackboxReviewRunsMaxCount);
  let serialized = JSON.stringify(pruned);

  while (serialized.length > llmBlackboxReviewRunsMaxSerializedLength && pruned.length > 1) {
    pruned = pruned.slice(0, -1);
    serialized = JSON.stringify(pruned);
  }

  return pruned;
}

function getSessionStorage(): ReviewStorageLike | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function isReviewRunRecord(value: unknown): value is LlmBlackboxReviewRun {
  return Boolean(
    value
    && typeof value === "object"
    && typeof (value as { id?: unknown }).id === "string"
    && Array.isArray((value as { flows?: unknown }).flows),
  );
}
