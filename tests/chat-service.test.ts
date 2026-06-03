import { describe, expect, it } from "vitest";

import {
  chatRequestSchema,
  prepareChatRequest,
} from "@/lib/server/chat/chat-service";
import {
  createAgentTextChatResponse,
  createProductionAgentTextChatPlanner,
} from "@/lib/server/chat/agent-text-chat-service";
import { AGENT_ERROR_CODES } from "@/lib/server/agent-core/errors";
import { ReplayPlanner } from "@/lib/server/agent-planners/replay-planner";
import { createChatConversation } from "./fixtures/domain";

async function readNdjsonEvents(response: Response) {
  const text = await response.text();

  return text.trim().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe("chat service agent text flow boundary", () => {
  it("accepts current chat request shape and ignores removed legacy event toggles", () => {
    const parsed = chatRequestSchema.parse({
      latestUserMessage: "给我一个 30 分钟居家训练",
      conversationSummary: "",
      emitLegacyEvents: true,
    });

    expect(parsed).toEqual({
      latestUserMessage: "给我一个 30 分钟居家训练",
      conversationSummary: "",
    });
    expect("emitLegacyEvents" in parsed).toBe(false);
  });

  it("hydrates saved server messages without constructing Agent execution facts", () => {
    const savedConversation = createChatConversation({
      messages: [
        { id: "m1", role: "user", content: "我想练胸", createdAt: "2026-06-01T00:00:00.000Z" },
        { id: "m2", role: "assistant", content: "已生成训练", createdAt: "2026-06-01T00:01:00.000Z" },
      ],
      conversationSummary: { summary: "用户想练胸。" },
    });
    const prepared = prepareChatRequest(
      {
        conversationId: savedConversation.id,
        latestUserMessage: "换成徒手",
        conversationSummary: "客户端摘要不可信。",
      },
      { savedConversation },
    );

    expect(prepared.rawMessages.map((message) => message.content)).toEqual([
      "我想练胸",
      "已生成训练",
      "换成徒手",
    ]);
    expect(prepared.conversationSummaryContext.summary).toBe("用户想练胸。");
    expect(prepared.hydration.source).toBe("server_saved");
    expect(prepared).not.toHaveProperty("contextPackage");
    expect(prepared).not.toHaveProperty("agentExecutionResult");
  });

  it("projects final_answer into content and done NDJSON with an empty production registry", async () => {
    const prepared = prepareChatRequest({
      latestUserMessage: "今天练胸",
      conversationSummary: "",
    });
    const planner = new ReplayPlanner([
      { type: "final_answer", content: "可以，今天先做轻量胸部训练。" },
    ]);
    const response = await createAgentTextChatResponse({
      request: prepared,
      currentUser: { id: "user-1" },
      planner,
    });
    const events = await readNdjsonEvents(response);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/x-ndjson");
    expect(events).toEqual([
      { type: "content", content: "可以，今天先做轻量胸部训练。" },
      { type: "done" },
    ]);
    expect(planner.calls[0].manifests).toEqual([]);
    expect(planner.calls[0].run).toMatchObject({
      actor: { userId: "user-1" },
      userInput: "今天练胸",
      metadata: {
        hydration: expect.objectContaining({ source: "latest_message" }),
      },
    });
  });

  it("projects ask_user into clarification content and assistant_suggestions", async () => {
    const prepared = prepareChatRequest({
      latestUserMessage: "帮我安排训练",
      conversationSummary: "",
    });
    const response = await createAgentTextChatResponse({
      request: prepared,
      currentUser: { id: "user-1" },
      planner: new ReplayPlanner([
        { type: "ask_user", question: "你今天有多少时间？", suggestions: ["20 分钟", "40 分钟"] },
      ]),
    });

    await expect(readNdjsonEvents(response)).resolves.toEqual([
      { type: "content", content: "你今天有多少时间？" },
      { type: "assistant_suggestions", suggestions: ["20 分钟", "40 分钟"] },
      { type: "done" },
    ]);
  });

  it("returns stable configuration errors without the old chat_ai_disabled path", async () => {
    const plannerResult = createProductionAgentTextChatPlanner({
      env: { DEEPSEEK_API_KEY: "" },
    });

    expect(plannerResult).toMatchObject({
      ok: false,
      error: {
        code: "chat_ai_not_configured",
        message: "Chat AI model configuration is missing.",
      },
    });

    const response = await createAgentTextChatResponse({
      request: prepareChatRequest({ latestUserMessage: "你好", conversationSummary: "" }),
      currentUser: { id: "user-1" },
      plannerFactory: () => plannerResult,
    });
    const events = await readNdjsonEvents(response);

    expect(response.status).toBe(503);
    expect(JSON.stringify(events)).not.toContain("chat_ai_disabled");
    expect(events).toEqual([
      {
        type: "error",
        error: {
          code: "chat_ai_not_configured",
          message: "聊天服务暂时不可用，请稍后再试。",
          retryable: false,
          details: { code: "chat_ai_not_configured", missing: ["DEEPSEEK_API_KEY"] },
        },
      },
      { type: "done" },
    ]);
  });

  it("projects repeated empty-registry tool_call failures as a safe unsupported response", async () => {
    const planner = new ReplayPlanner([
      { type: "tool_call", toolName: "searchExercises", input: { query: "胸" } },
      { type: "tool_call", toolName: "searchExercises", input: { query: "胸" } },
    ]);
    const response = await createAgentTextChatResponse({
      request: prepareChatRequest({ latestUserMessage: "推荐胸部动作", conversationSummary: "" }),
      currentUser: { id: "user-1" },
      planner,
    });
    const events = await readNdjsonEvents(response);

    expect(planner.calls[0].manifests).toEqual([]);
    expect(events).toEqual([
      {
        type: "content",
        content: "目前还不能直接生成、保存或执行训练计划。我可以先帮你梳理训练目标、解释动作和训练原则，或整理需要补充的信息。",
      },
      {
        type: "assistant_suggestions",
        suggestions: ["先帮我梳理训练目标", "解释一个动作怎么做", "我需要补充哪些信息"],
      },
      { type: "done" },
    ]);
    expect(JSON.stringify(events)).not.toContain(AGENT_ERROR_CODES.REPAIR_LIMIT_EXCEEDED);
    expect(JSON.stringify(events)).not.toContain("Agent runtime reached the invalid action repair limit.");
    expect(JSON.stringify(events)).not.toContain("Tool \"searchExercises\" is not registered.");
  });
});
