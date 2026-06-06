import { describe, expect, it } from "vitest";

import {
  agentRuntimeConfig,
  agentLlmPromptConfig,
  agentLlmPromptVersion,
  buildAgentActionSystemPrompt,
  buildTerminalFailureFinalizerSystemPrompt,
  defaultAgentActionContract,
  getAgentActionContract,
  terminalFailureFinalizerPromptConfig,
  terminalFailureFinalizerPromptVersion,
  type AgentLlmPromptConfig,
} from "@/lib/server/config";

describe("agent LLM prompt configuration", () => {
  it("exposes a short default system prompt and structured AgentAction contract", () => {
    const systemPrompt = buildAgentActionSystemPrompt();
    const actionContract = getAgentActionContract();
    const serializedContract = JSON.stringify(actionContract);

    expect(agentLlmPromptConfig.promptVersion).toBe(agentLlmPromptVersion);
    expect(agentLlmPromptVersion).toBe("agent-action-v20-tool-manifest-layers");
    expect(systemPrompt.length).toBeLessThan(1500);

    for (const required of [
      "只能返回一个合法 JSON object",
      "actionContract、tools、outputContracts、observations、toolResults",
      "type 只能是 tool_call、final_answer、ask_user",
      "字段合法性由服务端 Zod 校验",
      "toolName 必须来自 tools[].name",
      "决策顺序",
      "final_answer 是本轮终态",
      "输出 visibleOutputs[] 时只遵守当前 outputContracts[]",
      "satisfied=true tool result、consumable resource",
      "reuse、derive、modify、replace、clarify",
      "不得提供医疗诊断、治疗建议",
    ]) {
      expect(systemPrompt).toContain(required);
    }

    for (const forbidden of [
      "<tools.name>",
      "\"usedRefs\":[]",
      "\"resourceType\":\"tool_result\"",
      "ask_user.question",
      "usedToolResultIds",
      "usedResourceRefs",
      "schema_validation_failed",
      "domain_validation_failed",
      "visibleTrainingProposal",
      "visibleTrainingProposal.payload.kind",
      "exercise_selection",
      "payload.kind = routine",
      "payload.kind = plan",
      "warmup、training、stretch 三类",
      "schedule.assignments 表达训练日和休息日",
      "setRestSeconds",
      "transitionRestSeconds",
      "missingSectionsForRoutineOrPlan",
      "visible_training_proposal_fact",
      "searchExerciseResources",
      "inspectVisibleTrainingProposals",
      "resolveExerciseResourceMentions",
      "必须调用 searchExerciseResources",
      "固定调用顺序",
      "用户要“",
      "用户说某个固定词语",
      "换一批",
      "再来一组",
      "toolName = inspectVisibleTrainingProposals",
      "\"factRef\":\"",
      "\"messageId\":\"",
      "\"resourceId\":\"",
      "searchExercises",
      "generateRoutine",
      "generatePlanDraft",
      "generateRoutineDraft",
      "saveWorkout",
      "queryUserMemory",
    ]) {
      expect(systemPrompt).not.toContain(forbidden);
    }

    expect(actionContract).toMatchObject({
      schemaId: "AgentAction",
      schemaVersion: "1",
      shapes: {
        tool_call: {
          type: "tool_call",
        },
        final_answer: {
          type: "final_answer",
          content: "用户可见文本",
        },
        ask_user: {
          type: "ask_user",
          content: "需要用户补充的信息",
        },
      },
    });
    for (const required of [
      "fieldDictionary",
      "decisionPolicy",
      "groundingPolicy",
      "referencePolicy",
      "repairPolicy",
      "factRef",
      "messageId",
      "resource.id",
      "diagnostic resource",
      "consumable resource",
      "factSchemaVersion",
      "visibleOutputs[].schemaVersion",
      "tool result 不是最终回答",
      "requiredExerciseIds",
      "excludeExerciseIds",
      "不要只输出 input 片段",
      "plain_fitness_explanation",
      "missing_training_constraints",
      "needs_registered_facts",
      "partial_facts_for_structured_output",
      "ready_visible_output",
      "reference_replace_or_modify",
      "suggestedQuestions",
      "最多 3 条用户口吻",
      "validator repair details",
    ]) {
      expect(serializedContract).toContain(required);
    }
    expect(serializedContract).not.toContain("schema_validation_failed");
    expect(serializedContract).not.toContain("domain_validation_failed");
    for (const forbidden of [
      "ask_user.question",
      "final_answer.assistantSuggestions",
      "ask_user.suggestions",
      "usedToolResultIds",
      "usedResourceRefs",
      "visibleTrainingProposal.payload.kind",
      "searchExerciseResources",
      "inspectVisibleTrainingProposals",
      "resolveExerciseResourceMentions",
    ]) {
      expect(serializedContract).not.toContain(forbidden);
    }
    const clonedContract = getAgentActionContract();
    clonedContract.fieldDictionary[0].meaning = "mutated";
    expect(getAgentActionContract().fieldDictionary[0].meaning).not.toBe("mutated");

    expect(agentLlmPromptConfig.requestDefaults).toEqual({
      temperature: agentRuntimeConfig.llm.temperature,
      maxTokens: agentRuntimeConfig.llm.maxTokens,
    });
  });

  it("builds custom system prompts without mutating the default prompt config", () => {
    const customConfig: AgentLlmPromptConfig = {
      promptVersion: "agent-action-test",
      systemPromptInstructions: [
        "返回测试专用 AgentAction JSON object。",
        "这个测试只期望 final_answer。",
      ],
      actionContract: defaultAgentActionContract,
      requestDefaults: {
        temperature: 0.2,
        maxTokens: 321,
      },
    };

    expect(buildAgentActionSystemPrompt(customConfig)).toBe(
      "返回测试专用 AgentAction JSON object。 这个测试只期望 final_answer。",
    );
    expect(buildAgentActionSystemPrompt()).toContain("tool_call、final_answer、ask_user");
    expect(agentLlmPromptConfig.promptVersion).toBe("agent-action-v20-tool-manifest-layers");
  });

  it("exposes a dedicated terminal failure finalizer prompt and budget config", () => {
    const systemPrompt = buildTerminalFailureFinalizerSystemPrompt();

    expect(terminalFailureFinalizerPromptConfig.promptVersion).toBe(terminalFailureFinalizerPromptVersion);
    expect(terminalFailureFinalizerPromptVersion).toBe("terminal-failure-finalizer-v1");
    expect(systemPrompt).toContain("主 Agent 已经耗尽内部修复机会");
    expect(systemPrompt).toContain("本轮没有满足用户需求");
    expect(systemPrompt).toContain("只能输出一个 JSON object");
    expect(systemPrompt).toContain("字段只允许 `content` 和可选 `suggestedQuestions`");
    expect(systemPrompt).toContain("不得输出 `AgentAction`、`tool_call`、`visibleOutputs`");
    expect(systemPrompt).toContain("最多 3 条");
    expect(systemPrompt).not.toContain("toolName 只能复制当前 tools[].name");
    expect(systemPrompt).not.toContain("tools 清单");
    expect(agentRuntimeConfig.terminalFailureFinalizer).toEqual({
      enabled: true,
      maxCallsPerRun: 1,
      timeoutMs: 3000,
      maxTokens: 500,
      temperature: 0.2,
      maxSuggestedQuestions: 3,
      deepSeek: {
        thinkingType: "disabled",
      },
    });
  });
});
