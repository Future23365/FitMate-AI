import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";

import {
  recordAiTokenUsageSummary,
  summarizeModelTokenUsages,
} from "@/lib/server/usage/ai-token-usage-summary-service";
import { normalizeModelTokenUsage } from "@/lib/server/usage/model-token-usage";

describe("AI token usage summary service", () => {
  it("writes a request/message scoped usage summary through an idempotent upsert", async () => {
    const repository = createRepository();

    await expect(recordAiTokenUsageSummary({
      userId: "user-1",
      conversationId: "conversation-1",
      messageId: "assistant-1",
      usage: {
        promptTokens: 12,
        completionTokens: 4,
        totalTokens: 16,
        hasUnknownUsage: false,
      },
    }, { repository })).resolves.toEqual({ ok: true });

    expect(repository.upsert).toHaveBeenCalledWith({
      where: {
        aiTokenUsageSummaryIdentity: {
          userId: "user-1",
          conversationId: "conversation-1",
          messageId: "assistant-1",
        },
      },
      create: expect.objectContaining({
        userId: "user-1",
        conversationId: "conversation-1",
        messageId: "assistant-1",
        promptTokens: 12,
        completionTokens: 4,
        totalTokens: 16,
        hasUnknownUsage: false,
      }),
      update: {
        promptTokens: 12,
        completionTokens: 4,
        totalTokens: 16,
        hasUnknownUsage: false,
      },
    });
  });

  it("keeps duplicate recording idempotent by updating the same identity instead of incrementing totals", async () => {
    const repository = createRepository();
    const input = {
      userId: "user-1",
      conversationId: "conversation-1",
      messageId: "assistant-1",
      usage: {
        promptTokens: 1,
        completionTokens: 2,
        totalTokens: 3,
        hasUnknownUsage: false,
      },
    };

    await recordAiTokenUsageSummary(input, { repository });
    await recordAiTokenUsageSummary(input, { repository });

    expect(repository.upsert).toHaveBeenCalledTimes(2);
    expect(repository.upsert.mock.calls[1][0].where).toEqual(repository.upsert.mock.calls[0][0].where);
    expect(repository.upsert.mock.calls[1][0].update).toEqual(repository.upsert.mock.calls[0][0].update);
  });

  it("summarizes multiple internal model calls into one production usage summary", () => {
    expect(summarizeModelTokenUsages([
      { prompt_tokens: 7, completion_tokens: 3, total_tokens: 10 },
      { prompt_tokens: 11, completion_tokens: 5, total_tokens: 16 },
    ])).toEqual({
      promptTokens: 18,
      completionTokens: 8,
      totalTokens: 26,
      hasUnknownUsage: false,
    });
  });

  it("preserves partial usage without turning unknown token fields into zero", () => {
    expect(summarizeModelTokenUsages([
      { prompt_tokens: 7 },
      { completion_tokens: 5 },
    ])).toEqual({
      promptTokens: 7,
      completionTokens: 5,
      totalTokens: undefined,
      hasUnknownUsage: true,
    });
  });

  it("represents provider calls without usage as unknown instead of fake zero", async () => {
    const repository = createRepository();
    const usage = summarizeModelTokenUsages([undefined]);

    expect(usage).toEqual({
      promptTokens: undefined,
      completionTokens: undefined,
      totalTokens: undefined,
      hasUnknownUsage: true,
    });
    await expect(recordAiTokenUsageSummary({
      userId: "user-1",
      conversationId: "conversation-1",
      messageId: "assistant-1",
      usage,
    }, { repository })).resolves.toEqual({ ok: true });
    expect(repository.upsert.mock.calls[0][0].create).toMatchObject({
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
      hasUnknownUsage: true,
    });
  });

  it("skips writes without a request/message identity", async () => {
    const repository = createRepository();

    await expect(recordAiTokenUsageSummary({
      userId: "user-1",
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2, hasUnknownUsage: false },
    }, { repository })).resolves.toEqual({ ok: true, skippedReason: "missing_identity" });
    expect(repository.upsert).not.toHaveBeenCalled();
  });

  it("isolates persistence failures from the chat flow", async () => {
    const repository = createRepository();
    repository.upsert.mockRejectedValueOnce(new Error("database unavailable"));

    await expect(recordAiTokenUsageSummary({
      userId: "user-1",
      conversationId: "conversation-1",
      messageId: "assistant-1",
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2, hasUnknownUsage: false },
    }, { repository })).resolves.toMatchObject({
      ok: false,
      reason: "write_failed",
    });
  });

  it("does not derive total token usage from a single known partial side", () => {
    expect(normalizeModelTokenUsage({ prompt_tokens: 9 })).toEqual({
      prompt_tokens: 9,
      completion_tokens: undefined,
      total_tokens: undefined,
    });
    expect(normalizeModelTokenUsage({ prompt_tokens: 9, completion_tokens: 1 })).toEqual({
      prompt_tokens: 9,
      completion_tokens: 1,
      total_tokens: 10,
    });
  });
});

function createRepository() {
  return {
    upsert: vi.fn(async (args: Prisma.AiTokenUsageSummaryUpsertArgs) => args),
  };
}
