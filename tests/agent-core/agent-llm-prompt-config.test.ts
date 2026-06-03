import { describe, expect, it } from "vitest";

import {
  agentLlmPromptConfig,
  agentLlmPromptVersion,
  buildAgentActionSystemPrompt,
  type AgentLlmPromptConfig,
} from "@/lib/server/agent-planners/prompts/agent-llm-prompt-config";

describe("agent LLM prompt configuration", () => {
  it("exposes a stable default AgentAction prompt and version", () => {
    const systemPrompt = buildAgentActionSystemPrompt();

    expect(agentLlmPromptConfig.promptVersion).toBe(agentLlmPromptVersion);
    expect(agentLlmPromptVersion).toBe("agent-action-v1");
    expect(systemPrompt).toContain("Return exactly one JSON object matching the AgentAction contract.");
    expect(systemPrompt).toContain("Allowed type values are tool_call, final_answer, and ask_user.");
    expect(systemPrompt).toContain("Do not execute tools, invent confirmation hashes, leak secrets, or emit NDJSON events.");
    expect(agentLlmPromptConfig.requestDefaults).toEqual({
      temperature: 0,
      maxTokens: 1_200,
    });
  });

  it("builds custom system prompts without mutating the default prompt config", () => {
    const customConfig: AgentLlmPromptConfig = {
      promptVersion: "agent-action-test",
      systemPromptInstructions: [
        "Return a custom AgentAction JSON object.",
        "Use only final_answer for this adapter test.",
      ],
      requestDefaults: {
        temperature: 0.2,
        maxTokens: 321,
      },
    };

    expect(buildAgentActionSystemPrompt(customConfig)).toBe(
      "Return a custom AgentAction JSON object. Use only final_answer for this adapter test.",
    );
    expect(buildAgentActionSystemPrompt()).toContain("tool_call, final_answer, and ask_user");
    expect(agentLlmPromptConfig.promptVersion).toBe("agent-action-v1");
  });
});
