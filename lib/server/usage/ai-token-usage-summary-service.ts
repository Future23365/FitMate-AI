import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";

import type { ModelTokenUsage } from "@/lib/server/agent-planners/model-adapters/model-adapter";
import { getPrismaClient } from "@/lib/server/db/prisma";

export type ProductionTokenUsageSummary = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  hasUnknownUsage: boolean;
};

export type RecordAiTokenUsageSummaryInput = {
  userId: string;
  conversationId?: string | null;
  messageId?: string | null;
  usage?: ProductionTokenUsageSummary;
};

export type AiTokenUsageSummaryWriteResult =
  | { ok: true; skippedReason?: "missing_identity" | "no_usage" }
  | { ok: false; reason: "write_failed"; error: unknown };

type AiTokenUsageSummaryRepository = {
  upsert: (args: Prisma.AiTokenUsageSummaryUpsertArgs) => PromiseLike<unknown>;
};

/** summarizeModelTokenUsages 将同一次聊天响应内的模型调用 usage 合并成请求 / 消息级生产统计。 */
export function summarizeModelTokenUsages(
  usages: readonly (ModelTokenUsage | undefined)[],
): ProductionTokenUsageSummary | undefined {
  if (usages.length === 0) {
    return undefined;
  }

  let hasAnyKnownUsage = false;
  let hasUnknownUsage = false;
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;
  let hasPromptTokens = false;
  let hasCompletionTokens = false;
  let hasTotalTokens = false;

  for (const usage of usages) {
    const normalized = normalizeProductionTokenUsage(usage);

    if (!normalized) {
      hasUnknownUsage = true;
      continue;
    }

    hasAnyKnownUsage = true;

    if (normalized.promptTokens === undefined) {
      hasUnknownUsage = true;
    } else {
      hasPromptTokens = true;
      promptTokens += normalized.promptTokens;
    }

    if (normalized.completionTokens === undefined) {
      hasUnknownUsage = true;
    } else {
      hasCompletionTokens = true;
      completionTokens += normalized.completionTokens;
    }

    if (normalized.totalTokens === undefined) {
      hasUnknownUsage = true;
    } else {
      hasTotalTokens = true;
      totalTokens += normalized.totalTokens;
    }
  }

  if (!hasAnyKnownUsage && !hasUnknownUsage) {
    return undefined;
  }

  return {
    promptTokens: hasPromptTokens ? promptTokens : undefined,
    completionTokens: hasCompletionTokens ? completionTokens : undefined,
    totalTokens: hasTotalTokens ? totalTokens : undefined,
    hasUnknownUsage,
  };
}

/** recordAiTokenUsageSummary 是生产 token 汇总表写入入口，不属于 Trace 诊断层。 */
export async function recordAiTokenUsageSummary(
  input: RecordAiTokenUsageSummaryInput,
  options: { repository?: AiTokenUsageSummaryRepository } = {},
): Promise<AiTokenUsageSummaryWriteResult> {
  const conversationId = input.conversationId?.trim();
  const messageId = input.messageId?.trim();

  if (!conversationId || !messageId) {
    return { ok: true, skippedReason: "missing_identity" };
  }

  if (!input.usage) {
    return { ok: true, skippedReason: "no_usage" };
  }

  const data = toPrismaUsageData(input.usage);

  try {
    const repository = options.repository ?? getPrismaClient().aiTokenUsageSummary;
    await repository.upsert({
      where: {
        aiTokenUsageSummaryIdentity: {
          userId: input.userId,
          conversationId,
          messageId,
        },
      },
      create: {
        userId: input.userId,
        conversationId,
        messageId,
        ...data,
      },
      update: data,
    });

    return { ok: true };
  } catch (error) {
    return { ok: false, reason: "write_failed", error };
  }
}

function normalizeProductionTokenUsage(usage: ModelTokenUsage | undefined): ProductionTokenUsageSummary | undefined {
  if (!usage) {
    return undefined;
  }

  const promptTokens = normalizeTokenValue(usage.prompt_tokens);
  const completionTokens = normalizeTokenValue(usage.completion_tokens);
  const totalTokens = normalizeTokenValue(usage.total_tokens);

  if (promptTokens === undefined && completionTokens === undefined && totalTokens === undefined) {
    return undefined;
  }

  return {
    promptTokens,
    completionTokens,
    totalTokens,
    hasUnknownUsage: promptTokens === undefined || completionTokens === undefined || totalTokens === undefined,
  };
}

function normalizeTokenValue(value: number | undefined) {
  if (value === undefined) {
    return undefined;
  }

  if (!Number.isSafeInteger(value) || value < 0) {
    return undefined;
  }

  return value;
}

function toPrismaUsageData(usage: ProductionTokenUsageSummary) {
  return {
    promptTokens: usage.promptTokens ?? null,
    completionTokens: usage.completionTokens ?? null,
    totalTokens: usage.totalTokens ?? null,
    hasUnknownUsage: usage.hasUnknownUsage,
  };
}
