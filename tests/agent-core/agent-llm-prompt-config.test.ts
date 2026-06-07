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
import { AgentActionSchema } from "@/lib/server/agent-core/contracts";

describe("agent LLM prompt configuration", () => {
  it("exposes a short default system prompt and structured AgentAction contract", () => {
    const systemPrompt = buildAgentActionSystemPrompt();
    const actionContract = getAgentActionContract();
    const serializedContract = JSON.stringify(actionContract);

    expect(agentLlmPromptConfig.promptVersion).toBe(agentLlmPromptVersion);
    expect(agentLlmPromptVersion).toBe("agent-action-v25-server-provenance");
    expect(systemPrompt.length).toBeLessThan(2400);

    for (const required of [
      "只能返回一个合法 JSON object",
      "system message 中的 protocol",
      "user payload 中的 context",
      "只有出现 repairContext 时才进入修复语境",
      "type 只能是 tool_call、final_answer、ask_user",
      "字段合法性由服务端 Zod 校验",
      "toolName 必须来自 tools[].name",
      "决策顺序",
      "final_answer 是本轮终态",
      "输出 visibleOutputs[] 时只遵守 protocol.outputContracts[]",
      "`activitySummary` 是可选用户态短中文活动摘要",
      "不是推理内容、最终回答、tool input、业务判断或 NDJSON event",
      "satisfied=true tool result、模型可见业务事实",
      "reuse、derive、modify、replace、clarify",
      "不得提供医疗诊断、治疗建议",
      "用户可见文本，只能使用面向用户的产品语言",
    ]) {
      expect(systemPrompt).toContain(required);
    }

    for (const forbidden of [
      "<tools.name>",
      "\"usedRefs\":[]",
      "\"resourceType\":\"tool_result\"",
      "ask_user.question",
      "usedRefs",
      "usedToolResultIds",
      "usedResourceRefs",
      "resourceId",
      "toolResultId",
      "factRef",
      "messageId",
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
      "missingSections",
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
          activitySummary: "可选，40 字以内中文短句，只描述本轮准备做什么",
        },
        final_answer: {
          type: "final_answer",
          content: "用户可见文本",
          activitySummary: "可选，40 字以内中文短句，只描述本轮正在整理最终回复",
        },
        ask_user: {
          type: "ask_user",
          content: "需要用户补充的信息",
          activitySummary: "可选，40 字以内中文短句，只描述本轮需要向用户确认什么",
        },
      },
    });
    for (const required of [
      "fieldDictionary",
      "activitySummary",
      "只用于当前请求活动条展示",
      "需要确认训练条件",
      "需要查询可用事实",
      "suggestedQuestionsPolicy",
      "decisionPolicy",
      "groundingPolicy",
      "referencePolicy",
      "repairPolicy",
      "diagnostic fact",
      "business fact",
      "factSchemaVersion",
      "visibleOutputs[].schemaVersion",
      "tool result 不是最终回答",
      "不需要输出内部引用字段",
      "必须把结构写入 visibleOutputs[]",
      "requiredExerciseIds",
      "excludeExerciseIds",
      "不要只输出 input 片段",
      "plain_fitness_explanation",
      "missing_training_constraints",
      "successful_answer_with_next_steps",
      "needs_registered_facts",
      "partial_facts_for_structured_output",
      "ready_visible_output",
      "reference_replace_or_modify",
      "suggestedQuestions",
      "最多 3 条用户口吻",
      "不是只写在 content",
      "给我一批更简单的徒手动作",
      "repairContext",
    ]) {
      expect(serializedContract).toContain(required);
    }
    expect(AgentActionSchema.safeParse({
      type: "tool_call",
      toolName: "readFixture",
      input: {},
      activitySummary: "需要查询可用事实",
    }).success).toBe(true);
    expect(AgentActionSchema.safeParse({
      type: "final_answer",
      content: "可以。",
      activitySummary: "正在整理训练解释",
    }).success).toBe(true);
    expect(AgentActionSchema.safeParse({
      type: "ask_user",
      content: "你今天能练多久？",
      activitySummary: "需要确认训练条件",
    }).success).toBe(true);
    expect(serializedContract).not.toContain("schema_validation_failed");
    expect(serializedContract).not.toContain("domain_validation_failed");
    for (const forbidden of [
      "ask_user.question",
      "final_answer.assistantSuggestions",
      "ask_user.suggestions",
      "usedRefs",
      "usedToolResultIds",
      "usedResourceRefs",
      "resourceId",
      "toolResultId",
      "factRef",
      "messageId",
      "visibleTrainingProposal.payload.kind",
      "searchExerciseResources",
      "inspectVisibleTrainingProposals",
      "resolveExerciseResourceMentions",
      "换一批",
      "再来一组",
      "用户说某个固定词语",
      "\"rationale\"",
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

  it("adds user-visible content safety boundaries to the global system prompt", () => {
    const systemPrompt = buildAgentActionSystemPrompt();

    for (const required of [
      "final_answer.content、ask_user.content 和 suggestedQuestions 都是用户可见文本",
      "不得在用户可见文本中暴露内部执行合同、工具名、schema 字段",
      "validator/runtime/resource/provider/trace/prompt/AgentAction",
      "基于动作库查到的动作事实",
      "基于当前对话中的训练目标",
      "当前缺少可核验的动作事实",
      "不要把 tool result、resource、visibleOutputs、schema、字段路径或工具调用细节写给用户",
      "不要展示内部错误 code、组件名、字段名、工具名、服务端校验细节或未执行的内部计划",
    ]) {
      expect(systemPrompt).toContain(required);
    }
  });

  it("keeps user-visible content safety boundaries generic instead of case-specific routing", () => {
    const systemPrompt = buildAgentActionSystemPrompt();

    expect(systemPrompt).toContain("只说明用户可理解的结果边界和可继续的下一步");
    expect(systemPrompt).not.toContain("默认的 warmup/stretch");
    expect(systemPrompt).not.toContain("当用户问“默认的 warmup/stretch”");
    expect(systemPrompt).not.toContain("toolName = searchExerciseResources");
    expect(systemPrompt).not.toContain("如果用户问是不是查的还是编的");
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
    expect(agentLlmPromptConfig.promptVersion).toBe("agent-action-v25-server-provenance");
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
