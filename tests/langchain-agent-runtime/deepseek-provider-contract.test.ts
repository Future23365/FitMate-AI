import { describe, expect, it } from "vitest";

import {
  deepSeekAssistantToolCallSchema,
  deepSeekFunctionToolSchema,
  deepSeekToolCallingAssistantMessageSchema,
  deepSeekToolMessageSchema,
} from "@/lib/server/langchain-agent/deepseek-provider-contract";

describe("DeepSeek native tool calling provider contract", () => {
  it("accepts the function tool shape exposed through provider tools", () => {
    const tool = {
      type: "function",
      function: {
        name: "searchExerciseResources",
        description: "只读查询发布态 Exercise 动作事实。",
        parameters: {
          type: "object",
          properties: {
            equipment: { type: "string", description: "无外部器械统一使用 no_equipment。" },
          },
          required: ["equipment"],
          additionalProperties: false,
        },
      },
    };

    expect(deepSeekFunctionToolSchema.safeParse(tool).success).toBe(true);
  });

  it("keeps provider tool arguments as an untrusted JSON string before wrapper validation", () => {
    const toolCall = {
      id: "call_1",
      type: "function",
      function: {
        name: "searchExerciseResources",
        arguments: "{\"equipment\":\"no_equipment\",\"unexpected\":true}",
      },
    };

    const parsed = deepSeekAssistantToolCallSchema.parse(toolCall);

    expect(parsed.function.arguments).toBeTypeOf("string");
    expect(JSON.parse(parsed.function.arguments)).toMatchObject({
      equipment: "no_equipment",
      unexpected: true,
    });
  });

  it("links tool result messages to the provider tool call id", () => {
    expect(deepSeekToolMessageSchema.parse({
      role: "tool",
      tool_call_id: "call_1",
      content: "{\"status\":\"succeeded\"}",
    })).toEqual({
      role: "tool",
      tool_call_id: "call_1",
      content: "{\"status\":\"succeeded\"}",
    });
  });

  it("captures the assistant tool_calls payload without treating it as a trusted business result", () => {
    const assistantMessage = {
      role: "assistant",
      content: null,
      tool_calls: [
        {
          id: "call_1",
          type: "function",
          function: {
            name: "resolveExerciseResourceMentions",
            arguments: "{\"mentions\":[{\"text\":\"俯卧撑\"}]}",
          },
        },
      ],
    };

    const parsed = deepSeekToolCallingAssistantMessageSchema.parse(assistantMessage);

    expect(parsed.tool_calls).toHaveLength(1);
    expect(parsed.tool_calls[0]?.id).toBe("call_1");
    expect(parsed.tool_calls[0]?.function.name).toBe("resolveExerciseResourceMentions");
  });
});
