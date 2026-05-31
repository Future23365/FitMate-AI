import "server-only";

import { z } from "zod";

import { serverRequest } from "@/lib/server/http/server-request";
import { readonlyToolNames, type ReadonlyToolName } from "./types";

type DeepSeekChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type DeepSeekChatResponse = {
  choices?: Array<{ message?: { content?: string | null } }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

const readonlyToolDecisionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("call_tool"),
    toolName: z.enum(readonlyToolNames),
    input: z.unknown(),
    reason: z.string().trim().min(1).max(300),
  }),
  z.object({
    action: z.literal("finish"),
    answerReadiness: z.enum(["enough_context", "needs_clarification", "fallback"]),
    reason: z.string().trim().min(1).max(300),
  }),
]);

export type ReadonlyToolDecision = z.infer<typeof readonlyToolDecisionSchema>;

export type ReadonlyToolDecisionResult =
  | {
      ok: true;
      decision: ReadonlyToolDecision;
      rawContent: string;
      tokenUsage?: DeepSeekChatResponse["usage"];
    }
  | {
      ok: false;
      code: "ai_request_failed" | "empty_content" | "invalid_json" | "invalid_decision";
      message: string;
      detail?: unknown;
      rawContent?: string;
    };

// JSON decision 协议只允许模型选择一个只读工具或停止，运行时不依赖标准 tools/tool_choice。
export async function requestReadonlyToolDecision(input: {
  apiKey: string;
  messages: DeepSeekChatMessage[];
  timeoutMs: number;
}): Promise<ReadonlyToolDecisionResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs);

  try {
    const response = await serverRequest("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
      },
      responseType: "raw",
      throwOnError: false,
      signal: controller.signal,
      body: {
        model: "deepseek-v4-flash",
        messages: input.messages,
        stream: false,
        response_format: {
          type: "json_object",
        },
        thinking: {
          type: "disabled",
        },
      },
    });

    if (!response.ok) {
      return {
        ok: false,
        code: "ai_request_failed",
        message: "Readonly tool decision request failed.",
        detail: await response.text(),
      };
    }

    const rawResponseText = await response.text();
    const body = JSON.parse(rawResponseText) as DeepSeekChatResponse;
    const content = body.choices?.[0]?.message?.content?.trim() ?? "";

    if (!content) {
      return {
        ok: false,
        code: "empty_content",
        message: "Readonly tool decision returned empty content.",
      };
    }

    const parsedJson = parseJsonObject(content);

    if (!parsedJson.ok) {
      return { ...parsedJson, rawContent: content };
    }

    const parsedDecision = parseReadonlyToolDecision(parsedJson.value);

    if (!parsedDecision.ok) {
      return { ...parsedDecision, rawContent: content };
    }

    return {
      ok: true,
      decision: parsedDecision.decision,
      rawContent: content,
      tokenUsage: body.usage,
    };
  } catch (error) {
    return {
      ok: false,
      code: "ai_request_failed",
      message:
        error instanceof DOMException && error.name === "AbortError"
          ? "Readonly tool decision request timed out."
          : "Readonly tool decision request failed.",
      detail: error instanceof Error ? error.message : error,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function parseReadonlyToolDecision(value: unknown):
  | { ok: true; decision: ReadonlyToolDecision }
  | { ok: false; code: "invalid_decision"; message: string; detail?: unknown } {
  if (Array.isArray(value)) {
    return {
      ok: false,
      code: "invalid_decision",
      message: "Readonly tool decision must not request multiple tools.",
    };
  }

  const parsed = readonlyToolDecisionSchema.safeParse(value);

  if (!parsed.success) {
    return {
      ok: false,
      code: "invalid_decision",
      message: "Readonly tool decision did not match schema.",
      detail: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    };
  }

  return {
    ok: true,
    decision: parsed.data,
  };
}

export function parseJsonObject(content: string):
  | { ok: true; value: unknown }
  | { ok: false; code: "invalid_json"; message: string; detail?: unknown } {
  const normalized = content.trim();
  const jsonText = normalized.startsWith("```")
    ? normalized.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
    : normalized;

  try {
    return {
      ok: true,
      value: JSON.parse(jsonText),
    };
  } catch (error) {
    return {
      ok: false,
      code: "invalid_json",
      message: "Response content is not valid JSON.",
      detail: error instanceof Error ? error.message : error,
    };
  }
}

export function isReadonlyToolName(value: string): value is ReadonlyToolName {
  return (readonlyToolNames as readonly string[]).includes(value);
}
