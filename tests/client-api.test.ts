import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  AgentTextChatHttpError,
  AgentTextChatStreamError,
  consumeAgentTextChatNdjson,
  getAgentTextChatErrorMessage,
  getAgentTextChatEventErrorMessage,
  requestAgentTextChatResponse,
} from "@/features/chat/api/chat-client";
import { saveChatConversation } from "@/features/chat/lib/chat-history";
import {
  createWorkoutSchedule as createWorkoutScheduleRequest,
  createWorkoutRoutine as createWorkoutRoutineRequest,
  deleteWorkoutSchedule,
  deleteWorkoutRoutine,
  getWorkoutRoutine,
  getWorkoutSchedule,
  listWorkoutRoutines,
  listWorkoutSchedules,
  saveWorkoutSessionResult,
  saveWorkoutRoutine,
  updateWorkoutScheduleStatus,
} from "@/features/workouts/api/workout-data-client";
import { ClientRequestError } from "@/lib/client/http/client-request";

import {
  createApiChatMessages,
  createChatConversation,
  createConversationContext,
  createWorkoutRoutine,
  createWorkoutSchedule,
} from "./fixtures/domain";

describe("frontend API clients", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { dispatchEvent: vi.fn() });
  });

  it("passes chat payload and consumes multi-line NDJSON text events", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response([
        JSON.stringify({ type: "agent_progress", stage: "preparing_context", status: "active", messageKey: "preparing_context", sequence: 1, toolName: "searchExerciseResources" }),
        JSON.stringify({ type: "agent_loop", loopTurn: 1, sequence: 2, toolName: "searchExerciseResources" }),
        JSON.stringify({ type: "agent_progress", stage: "analyzing_request", status: "active", messageKey: "analyzing_request", activitySummary: "需要查询动作库", sequence: 3 }),
        JSON.stringify({ type: "content", content: "你好" }),
        "",
        JSON.stringify({ type: "suggested_questions", suggestedQuestions: ["继续"] }),
        JSON.stringify({ type: "done" }),
      ].join("\n")));
    vi.stubGlobal("fetch", fetchMock);

    const messages = createApiChatMessages();
    const context = createConversationContext();
    const summary = { summary: context.summary };
    const signal = new AbortController().signal;
    const events: unknown[] = [];

    await requestAgentTextChatResponse({
      conversationId: "chat-1",
      responseMessageId: "assistant-1",
      latestUserMessage: messages[0].content,
      conversationSummary: summary.summary,
      conversationContext: context,
      thinkingEnabled: false,
      signal,
      onEvent: (event) => events.push(event),
    });

    expect(events).toEqual([
      { type: "agent_progress", stage: "preparing_context", status: "active", messageKey: "preparing_context", sequence: 1 },
      { type: "agent_loop", loopTurn: 1, sequence: 2 },
      { type: "agent_progress", stage: "analyzing_request", status: "active", messageKey: "analyzing_request", activitySummary: "需要查询动作库", sequence: 3 },
      { type: "content", content: "你好" },
      { type: "suggested_questions", suggestedQuestions: ["继续"] },
      { type: "done" },
    ]);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toMatchObject({
      responseMessageId: "assistant-1",
      thinkingEnabled: false,
      latestUserMessage: messages[0].content,
      conversationSummary: summary.summary,
    });
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual(["/api/chat"]);
  });

  it("does not convert legacy assistant_suggestions events into suggestedQuestions", async () => {
    const events: unknown[] = [];
    const streamError = await consumeAgentTextChatNdjson(new Response([
      JSON.stringify({ type: "content", content: "你好" }),
      JSON.stringify({ type: "assistant_suggestions", suggestions: ["继续"] }),
      JSON.stringify({ type: "done" }),
    ].join("\n")), (event) => events.push(event)).catch((error: unknown) => error);

    expect(streamError).toBeInstanceOf(AgentTextChatStreamError);
    expect(events).toEqual([{ type: "content", content: "你好" }]);
    expect(JSON.stringify(events)).not.toContain("suggestedQuestions");
  });

  it("parses agent_loop and agent_progress safely and rejects invalid activity payloads", async () => {
    const events: unknown[] = [];
    await consumeAgentTextChatNdjson(new Response([
      JSON.stringify({
        type: "agent_loop",
        loopTurn: 2,
        sequence: 6,
        toolName: "searchExerciseResources",
        resourceId: "res_internal",
      }),
      JSON.stringify({
        type: "agent_progress",
        stage: "raw_internal_tool_name",
        status: "active",
        sequence: 7,
        toolName: "searchExerciseResources",
        activitySummary: "需要确认训练条件",
      }),
      JSON.stringify({
        type: "agent_progress",
        stage: "validating_result",
        status: "active",
        messageKey: "validating_result",
        sequence: 8,
        activitySummary: "toolName=searchExerciseResources 内部调试",
      }),
      JSON.stringify({ type: "done" }),
    ].join("\n")), (event) => events.push(event));

    expect(events).toEqual([
      { type: "agent_loop", loopTurn: 2, sequence: 6 },
      { type: "agent_progress", stage: "raw_internal_tool_name", status: "active", messageKey: undefined, activitySummary: "需要确认训练条件", sequence: 7 },
      { type: "agent_progress", stage: "validating_result", status: "active", messageKey: "validating_result", sequence: 8 },
      { type: "done" },
    ]);
    expect(JSON.stringify(events)).not.toContain("toolName");
    expect(JSON.stringify(events)).not.toContain("searchExerciseResources");
    expect(JSON.stringify(events)).not.toContain("内部调试");

    const streamError = await consumeAgentTextChatNdjson(new Response(JSON.stringify({
      type: "agent_progress",
      stage: "querying_exercises",
      status: "internal_error",
      sequence: 1,
    })), vi.fn()).catch((error: unknown) => error);

    expect(streamError).toBeInstanceOf(AgentTextChatStreamError);

    const invalidLoopError = await consumeAgentTextChatNdjson(new Response(JSON.stringify({
      type: "agent_loop",
      loopTurn: 0,
      sequence: 1,
    })), vi.fn()).catch((error: unknown) => error);

    expect(invalidLoopError).toBeInstanceOf(AgentTextChatStreamError);
  });

  it("parses NDJSON split across chunks and rejects invalid JSON lines", async () => {
    const events: unknown[] = [];
    const response = new Response(streamFromChunks([
      "{\"type\":\"content\",\"content\":\"你",
      "好\"}\n{\"type\":\"done\"}\n",
    ]));

    await consumeAgentTextChatNdjson(response, (event) => events.push(event));

    expect(events).toEqual([
      { type: "content", content: "你好" },
      { type: "done" },
    ]);

    const streamError = await consumeAgentTextChatNdjson(new Response("{\"type\":\"content\"\n"), vi.fn())
      .catch((error: unknown) => error);

    expect(streamError).toBeInstanceOf(AgentTextChatStreamError);
    expect(getAgentTextChatErrorMessage(streamError)).toBe("聊天响应暂时无法读取。你可以稍后重试，或把问题缩小后再发一次。");
  });

  it("keeps HTTP, event, invalid NDJSON and stream errors user-safe", async () => {
    const eventErrors: unknown[] = [];

    await consumeAgentTextChatNdjson(new Response([
      JSON.stringify({
        type: "error",
        error: {
          code: "chat_ai_not_configured",
          message: "Chat AI model configuration is missing.",
        },
      }),
      JSON.stringify({ type: "done" }),
    ].join("\n")), (event) => eventErrors.push(event));

    expect(eventErrors[0]).toMatchObject({
      type: "error",
      error: {
        code: "chat_ai_not_configured",
        message: "Chat AI model configuration is missing.",
      },
    });
    expect(getAgentTextChatEventErrorMessage(eventErrors[0] as Parameters<typeof getAgentTextChatEventErrorMessage>[0]))
      .toBe("聊天服务暂时不可用，请稍后再试。");

    const fetchMock = vi.fn().mockResolvedValueOnce(new Response([
      JSON.stringify({
        type: "error",
        error: {
          code: "chat_ai_not_configured",
          message: "Chat AI model configuration is missing.",
        },
      }),
      JSON.stringify({ type: "done" }),
    ].join("\n"), { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    const context = createConversationContext();

    const httpError = await requestAgentTextChatResponse({
        conversationId: "chat-1",
        responseMessageId: "assistant-1",
        latestUserMessage: "你好",
        conversationSummary: "",
        conversationContext: context,
        thinkingEnabled: false,
        signal: new AbortController().signal,
        onEvent: vi.fn(),
      })
      .catch((error: unknown) => error);

    expect(httpError).toMatchObject({
      name: "AgentTextChatHttpError",
      status: 503,
      code: "chat_ai_not_configured",
      message: "聊天服务暂时不可用，请稍后再试。",
    } satisfies Partial<AgentTextChatHttpError>);
    expect(getAgentTextChatErrorMessage(httpError)).toBe("聊天服务暂时不可用，请稍后再试。");
    expect((httpError as Error).message).not.toContain("Chat AI model configuration is missing.");

    expect(getAgentTextChatEventErrorMessage({
      type: "error",
      error: {
        code: "terminal_reference_invalid",
        message: "visibleTrainingProposal 缺少 routine 或 plan 必要 section。",
      },
    })).toBe("这次没有生成通过校验的可靠训练结果。你可以缩小范围、补充缺失条件，或先让我说明当前事实能支撑的内容。");
    expect(getAgentTextChatEventErrorMessage({
      type: "error",
      error: {
        code: "overall_timeout",
        message: "Provider timed out while waiting for completion.",
      },
    })).toBe("这次请求需要的步骤或信息量超出了当前处理范围。你可以减少条件、缩小训练目标，或分两步提问。");
    expect(getAgentTextChatEventErrorMessage({
      type: "error",
      error: {
        code: "unclassified_internal_error",
        message: "Internal stack trace",
      },
    })).toBe("聊天服务暂时没能完成这次回复。你可以稍后重试，或把问题缩小后再发一次。");

    const controller = new AbortController();
    controller.abort();

    await expect(
      requestAgentTextChatResponse({
        conversationId: "chat-1",
        responseMessageId: "assistant-1",
        latestUserMessage: "你好",
        conversationSummary: "",
        conversationContext: context,
        thinkingEnabled: false,
        signal: controller.signal,
        onEvent: vi.fn(),
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("maps workout data requests, errors, and update events", async () => {
    const workoutRoutine = createWorkoutRoutine({ id: "workout-1" });
    const workoutSchedule = createWorkoutSchedule({ id: "session-1" });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(Response.json({ items: [workoutRoutine] }))
        .mockResolvedValueOnce(Response.json({ item: workoutRoutine }))
        .mockResolvedValueOnce(Response.json({ item: workoutRoutine }))
        .mockResolvedValueOnce(Response.json({ item: workoutRoutine }))
        .mockResolvedValueOnce(new Response(null, { status: 204 }))
        .mockResolvedValueOnce(Response.json({ items: [workoutSchedule] }))
        .mockResolvedValueOnce(Response.json({ item: workoutSchedule }))
        .mockResolvedValueOnce(Response.json({ item: workoutSchedule }))
        .mockResolvedValueOnce(Response.json({ item: { ...workoutSchedule, status: "completed" } }))
        .mockResolvedValueOnce(new Response(null, { status: 204 }))
        .mockResolvedValueOnce(Response.json({ item: { id: "result-1", status: "completed" } }))
        .mockResolvedValueOnce(Response.json({ message: "保存失败" }, { status: 500 })),
    );

    await expect(listWorkoutRoutines()).resolves.toEqual([workoutRoutine]);
    await expect(getWorkoutRoutine("workout-1")).resolves.toEqual(workoutRoutine);
    await expect(saveWorkoutRoutine(workoutRoutine)).resolves.toEqual(workoutRoutine);
    await expect(createWorkoutRoutineRequest(workoutRoutine)).resolves.toEqual(workoutRoutine);
    await expect(deleteWorkoutRoutine("workout-1")).resolves.toBeUndefined();
    await expect(listWorkoutSchedules()).resolves.toEqual([workoutSchedule]);
    await expect(getWorkoutSchedule("session-1")).resolves.toEqual(workoutSchedule);
    await expect(createWorkoutScheduleRequest(workoutSchedule)).resolves.toEqual(workoutSchedule);
    await expect(updateWorkoutScheduleStatus("session-1", "completed")).resolves.toMatchObject({ status: "completed" });
    await expect(deleteWorkoutSchedule("session-1")).resolves.toBeUndefined();
    await expect(saveWorkoutSessionResult("session-1", {
      completedExerciseCount: 1,
      completedStepCount: 2,
      durationSeconds: 120,
      endedAt: "2026-05-25T10:02:00.000Z",
      estimatedCalories: 20,
      startedAt: "2026-05-25T10:00:00.000Z",
      status: "completed",
      totalExerciseCount: 1,
      totalStepCount: 2,
    })).resolves.toMatchObject({ id: "result-1" });
    await expect(saveWorkoutRoutine(workoutRoutine)).rejects.toBeInstanceOf(ClientRequestError);
    expect(window.dispatchEvent).toHaveBeenCalled();
  });

  it("preserves chat message timestamps when saving chat history", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        item: createChatConversation({ id: "conversation-1" }),
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await saveChatConversation(
      "conversation-1",
      [
        {
          id: "message-1",
          role: "user",
          content: "今天在家练胸",
          createdAt: "2026-05-25T09:00:00.000Z",
        },
        {
          id: "message-2",
          role: "assistant",
          content: "可以。",
          createdAt: "2026-05-25T09:01:00.000Z",
        },
      ],
      { summary: "用户想在家练胸肌。" },
      createConversationContext(),
    );

    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toMatchObject({
      id: "conversation-1",
      messages: [
        { id: "message-1", createdAt: "2026-05-25T09:00:00.000Z" },
        { id: "message-2", createdAt: "2026-05-25T09:01:00.000Z" },
      ],
      conversationSummary: { summary: "用户想在家练胸肌。" },
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).not.toHaveProperty("plans");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).not.toHaveProperty("routines");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).not.toHaveProperty("exerciseRecommendations");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).not.toHaveProperty("recommendationIntents");
    expect(window.dispatchEvent).toHaveBeenCalledWith(expect.any(Event));
  });
});

function streamFromChunks(chunks: string[]) {
  const encoder = new TextEncoder();

  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }

      controller.close();
    },
  });
}
