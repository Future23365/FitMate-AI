import { describe, expect, it } from "vitest";

import { agentRuntimeConfig } from "@/lib/server/config";
import {
  createLangChainAgentResponseProjection,
  type LangChainAgentRunFailure,
  type LangChainAgentRunSuccess,
} from "@/lib/server/langchain-agent";

const baseSuccess: LangChainAgentRunSuccess = {
  ok: true,
  finalText: "可以，今天先做低强度胸部训练。",
  messages: [],
  toolExecutions: [],
  traceSummary: {
    runtimeVersion: "langchain-agent-runtime-v1",
    model: "injected-test-model",
    toolNames: [],
    modelRequestSummary: {
      inputMessageCount: 1,
      inputMessagePreviews: [{ role: "user", contentPreview: "我今天想练胸。" }],
      toolCount: 0,
    },
    modelResponseSummary: {
      generatedMessageCount: 1,
      assistantMessageCount: 1,
      toolMessageCount: 0,
      finalTextPreview: "可以，今天先做低强度胸部训练。",
    },
    modelCalls: [],
    providerToolCalls: [],
    modelCallCount: 1,
    toolCallCount: 0,
    messageCount: 1,
    durationMs: 12,
  },
};

describe("LangChain Agent response adapter", () => {
  it("projects a normal final message into content and done events", () => {
    const projection = createLangChainAgentResponseProjection({
      result: baseSuccess,
    });

    expect(projection).toMatchObject({
      projectionType: "content",
      events: [
        { type: "content", content: "可以，今天先做低强度胸部训练。" },
        { type: "done" },
      ],
      summary: {
        eventTypes: ["content", "done"],
        visibleOutputCount: 0,
        suggestedQuestionCount: 0,
      },
    });
  });

  it("projects safe suggested questions without using legacy assistant_suggestions", () => {
    const projection = createLangChainAgentResponseProjection({
      result: {
        ...baseSuccess,
        finalText: "你今天有多少时间？",
      },
      suggestedQuestions: ["10 分钟", "20 分钟", "30 分钟", "60 分钟"],
    });

    expect(projection.projectionType).toBe("content_with_suggestions");
    expect(projection.events).toEqual([
      { type: "content", content: "你今天有多少时间？" },
      { type: "suggested_questions", suggestedQuestions: ["10 分钟", "20 分钟", "30 分钟"] },
      { type: "done" },
    ]);
    expect(JSON.stringify(projection.events)).not.toContain("assistant_suggestions");
  });

  it("only emits visible_output for validator-approved structures supplied by the server", () => {
    const projection = createLangChainAgentResponseProjection({
      result: baseSuccess,
      validatedVisibleOutputs: [
        {
          outputType: "visibleTrainingProposal",
          schemaVersion: "1",
          payload: {
            kind: "routine",
            exerciseItems: [
              {
                exerciseId: "Pushups",
                section: "training",
                order: 1,
                prescription: {
                  mode: "reps",
                  sets: 2,
                  target: 10,
                  setRestSeconds: 45,
                  transitionRestSeconds: 30,
                },
              },
            ],
          },
          content: {
            kind: "routine",
            sections: [
              {
                section: "training",
                items: [{ exerciseId: "Pushups", section: "training", order: 1 }],
              },
            ],
          },
        },
      ],
    });

    expect(projection.projectionType).toBe("content_with_visible_output");
    expect(projection.events).toMatchObject([
      { type: "content" },
      {
        type: "visible_output",
        outputType: "visibleTrainingProposal",
        schemaVersion: "1",
        payload: {
          kind: "routine",
          exerciseItems: [{ exerciseId: "Pushups" }],
        },
      },
      { type: "done" },
    ]);
    expect(projection.summary).toMatchObject({
      eventTypes: ["content", "visible_output", "done"],
      visibleOutputCount: 1,
      projectionType: "content_with_visible_output",
    });
  });

  it("uses centralized trace projection budget for visible output event payloads", () => {
    const longNote = "x".repeat(agentRuntimeConfig.langChain.trace.ndjsonProjectionPreviewMaxLength + 200);
    const projection = createLangChainAgentResponseProjection({
      result: baseSuccess,
      validatedVisibleOutputs: [
        {
          outputType: "visibleTrainingProposal",
          schemaVersion: "1",
          payload: {
            kind: "routine",
            note: longNote,
          },
        },
      ],
    });
    const visibleOutput = projection.events.find((event) => event.type === "visible_output");

    expect(visibleOutput).toMatchObject({
      type: "visible_output",
      payload: {
        note: expect.stringContaining("[truncated:"),
      },
    });
  });

  it("does not expose raw tool userProjection as a front-end event", () => {
    const projection = createLangChainAgentResponseProjection({
      result: {
        ...baseSuccess,
        toolExecutions: [
          {
            toolName: "searchExerciseResources",
            status: "succeeded",
            userProjection: {
              internal: "tool result should stay out of NDJSON unless rendered as validated visible output",
            },
            enteredModelContext: true,
          },
        ],
      },
    });

    expect(JSON.stringify(projection.events)).not.toContain("tool result should stay out of NDJSON");
    expect(projection.summary.toolExecutions).toEqual([
      {
        toolName: "searchExerciseResources",
        status: "succeeded",
        enteredModelContext: true,
      },
    ]);
  });

  it("projects config failures as safe error and done events", () => {
    const projection = createLangChainAgentResponseProjection({
      result: createFailure({
        code: "config_missing",
        message: "DEEPSEEK_API_KEY is required.",
        retryable: false,
      }),
    });

    expect(projection).toMatchObject({
      projectionType: "transport_config_failure",
      events: [
        {
          type: "error",
          error: {
            code: "chat_ai_not_configured",
            retryable: false,
          },
        },
        { type: "done" },
      ],
      summary: {
        eventTypes: ["error", "done"],
        errorCode: "config_missing",
      },
    });
    expect(JSON.stringify(projection.events)).not.toContain("DEEPSEEK_API_KEY");
  });

  it("maps provider, budget and tool failures to safe content fallbacks", () => {
    expect(createLangChainAgentResponseProjection({
      result: createFailure({ code: "provider_error", message: "401", retryable: true }),
    }).projectionType).toBe("provider_unavailable_fallback");

    expect(createLangChainAgentResponseProjection({
      result: createFailure({ code: "budget_exhausted", message: "recursion", retryable: true }),
    }).projectionType).toBe("budget_timeout_fallback");

    const toolFailureProjection = createLangChainAgentResponseProjection({
      result: createFailure({
        code: "tool_schema_invalid",
        message: "invalid args",
        retryable: true,
        toolExecutions: [
          {
            toolName: "searchExerciseResources",
            status: "failed",
            failureCode: "tool_schema_invalid",
            failureMessage: "invalid args",
            enteredModelContext: true,
          },
        ],
      }),
    });

    expect(toolFailureProjection).toMatchObject({
      projectionType: "tool_failure_fallback",
      events: [
        { type: "content", content: expect.stringContaining("工具执行或参数校验没有成功") },
        { type: "suggested_questions" },
        { type: "done" },
      ],
      summary: {
        eventTypes: ["content", "suggested_questions", "done"],
        errorCode: "tool_schema_invalid",
        toolExecutions: [
          {
            toolName: "searchExerciseResources",
            status: "failed",
            failureCode: "tool_schema_invalid",
            enteredModelContext: true,
          },
        ],
      },
    });
    expect(JSON.stringify(toolFailureProjection.events)).not.toContain("invalid args");
  });
});

function createFailure(input: {
  code: LangChainAgentRunFailure["code"];
  message: string;
  retryable: boolean;
  toolExecutions?: LangChainAgentRunFailure["toolExecutions"];
}): LangChainAgentRunFailure {
  return {
    ok: false,
    code: input.code,
    message: input.message,
    retryable: input.retryable,
    messages: [],
    toolExecutions: input.toolExecutions ?? [],
  };
}
