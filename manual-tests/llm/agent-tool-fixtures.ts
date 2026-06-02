import type { AgentExecutionResult } from "@/lib/server/agent-orchestrator";

import type { BlackboxStateFixtureName } from "./blackbox-runner";
import type { BlackboxCardType } from "./flow-fixtures";

export type AgentToolCallGroup =
  | "recommendation"
  | "routine"
  | "plan"
  | "clarification"
  | "reference"
  | "patch"
  | "non_fitness"
  | "safety";

export type AgentToolCallStatus = AgentExecutionResult["status"];

export type AgentToolCallExpectation = {
  expectedAgentStatuses: [AgentToolCallStatus, ...AgentToolCallStatus[]];
  expectedCardTypes: BlackboxCardType[];
  allowedCardTypes?: BlackboxCardType[];
  forbidTrainingCards: boolean;
  requiredAgentTools: string[];
  forbiddenAgentTools: string[];
  requireCandidateSetId?: boolean;
  requireValidationId?: boolean;
  requirePolicyDecisionId?: boolean;
  requireRevisionId?: boolean;
  requireDependencyGraph?: boolean;
  requireLegacyPathDisabled?: boolean;
  maxRepairTurnCount?: number;
  note: string;
};

export type AgentToolCallCase = {
  id: string;
  name: string;
  source: string;
  group: AgentToolCallGroup;
  userInput: string;
  stateFixture: BlackboxStateFixtureName;
  expectation: AgentToolCallExpectation;
};

const generationWriteTools = [
  "generateRoutineDraft",
  "generatePlanDraft",
  "proposeWorkoutPatch",
  "validateRoutineDraft",
  "validatePlanDraft",
  "validateWorkoutPatch",
  "saveConversationArtifactRevision",
];

// 单次 Agent tool fixture 只表达本轮工具合同，不复用三轮黑盒流程结构。
export const agentToolCallCases: AgentToolCallCase[] = [
  {
    id: "AT01",
    name: "胸部动作推荐",
    source: "F01 第 1 轮",
    group: "recommendation",
    userInput: "今天我想练胸",
    stateFixture: "empty",
    expectation: {
      expectedAgentStatuses: ["generated"],
      expectedCardTypes: ["exercise_recommendation"],
      forbidTrainingCards: false,
      requiredAgentTools: ["searchExercises", "saveConversationArtifactRevision"],
      forbiddenAgentTools: ["generateRoutineDraft", "generatePlanDraft"],
      requireCandidateSetId: true,
      requireRevisionId: true,
      requireDependencyGraph: true,
      requireLegacyPathDisabled: true,
      maxRepairTurnCount: 1,
      note: "LLM 应选择动作检索和受控保存工具，生成动作推荐 artifact，不升级 routine 或 plan。",
    },
  },
  {
    id: "AT02",
    name: "居家背部 routine",
    source: "F04 第 1 轮",
    group: "routine",
    userInput: "今天在家练背30分钟",
    stateFixture: "empty",
    expectation: {
      expectedAgentStatuses: ["generated"],
      expectedCardTypes: ["workout_routine"],
      forbidTrainingCards: false,
      requiredAgentTools: [
        "searchExercises",
        "generateRoutineDraft",
        "validateRoutineDraft",
        "saveConversationArtifactRevision",
      ],
      forbiddenAgentTools: ["generatePlanDraft"],
      requireCandidateSetId: true,
      requireValidationId: true,
      requireRevisionId: true,
      requireDependencyGraph: true,
      requireLegacyPathDisabled: true,
      maxRepairTurnCount: 1,
      note: "LLM 应围绕单次 routine 调用检索、生成、校验和保存工具，不应误生成长期 plan。",
    },
  },
  {
    id: "AT03",
    name: "每周 4 练增肌计划",
    source: "F19 第 1 轮",
    group: "plan",
    userInput: "给我一个每周4练增肌计划",
    stateFixture: "empty",
    expectation: {
      expectedAgentStatuses: ["generated"],
      expectedCardTypes: ["workout_plan"],
      forbidTrainingCards: false,
      requiredAgentTools: [
        "searchExercises",
        "generatePlanDraft",
        "validatePlanDraft",
        "saveConversationArtifactRevision",
      ],
      forbiddenAgentTools: ["generateRoutineDraft"],
      requireCandidateSetId: true,
      requireValidationId: true,
      requireRevisionId: true,
      requireDependencyGraph: true,
      requireLegacyPathDisabled: true,
      maxRepairTurnCount: 1,
      note: "LLM 应保持长期 plan 语义，调用 plan 生成和校验工具。",
    },
  },
  {
    id: "AT04",
    name: "笼统训练请求先澄清",
    source: "F03 第 1 轮",
    group: "clarification",
    userInput: "给我一套训练",
    stateFixture: "empty",
    expectation: {
      expectedAgentStatuses: ["needs_clarification", "answered"],
      expectedCardTypes: [],
      allowedCardTypes: ["clarification", "answer"],
      forbidTrainingCards: true,
      requiredAgentTools: [],
      forbiddenAgentTools: generationWriteTools,
      requireDependencyGraph: true,
      requireLegacyPathDisabled: true,
      maxRepairTurnCount: 1,
      note: "信息不足时应澄清或说明需要补充条件，不应调用生成和保存工具产出随机训练卡片。",
    },
  },
  {
    id: "AT05",
    name: "非健身问题不进训练工具",
    source: "F13 第 1 轮",
    group: "non_fitness",
    userInput: "明天天气怎么样？",
    stateFixture: "empty",
    expectation: {
      expectedAgentStatuses: ["answered", "blocked"],
      expectedCardTypes: [],
      allowedCardTypes: ["answer", "blocked"],
      forbidTrainingCards: true,
      requiredAgentTools: [],
      forbiddenAgentTools: ["searchExercises", ...generationWriteTools],
      requireDependencyGraph: true,
      requireLegacyPathDisabled: true,
      maxRepairTurnCount: 1,
      note: "非健身输入不应触发动作检索、训练生成或 artifact 保存工具。",
    },
  },
  {
    id: "AT06",
    name: "不存在动作不编造 artifact",
    source: "F23 第 1 轮",
    group: "safety",
    userInput: "我想练你们库里没有的超级飞鸟跳",
    stateFixture: "empty",
    expectation: {
      expectedAgentStatuses: ["needs_clarification", "answered", "blocked"],
      expectedCardTypes: [],
      allowedCardTypes: ["clarification", "answer", "blocked"],
      forbidTrainingCards: true,
      requiredAgentTools: [],
      forbiddenAgentTools: ["saveConversationArtifactRevision"],
      requireDependencyGraph: true,
      requireLegacyPathDisabled: true,
      maxRepairTurnCount: 1,
      note: "点名不存在动作时可以检索或解释，但不能保存编造出来的训练 artifact。",
    },
  },
  {
    id: "AT07",
    name: "解释最近推荐第一个动作",
    source: "F15 第 3 轮",
    group: "reference",
    userInput: "第一个动作怎么做",
    stateFixture: "recent_recommendation",
    expectation: {
      expectedAgentStatuses: ["answered"],
      expectedCardTypes: [],
      allowedCardTypes: ["answer"],
      forbidTrainingCards: true,
      requiredAgentTools: ["getArtifactPayload"],
      forbiddenAgentTools: ["searchExercises", ...generationWriteTools],
      requireDependencyGraph: true,
      requireLegacyPathDisabled: true,
      maxRepairTurnCount: 1,
      note: "已有最近推荐卡片时，应读取 artifact payload 解释动作，不应刷新推荐或生成训练。",
    },
  },
  {
    id: "AT08",
    name: "最近 routine 排除哑铃后 patch",
    source: "W09 第 2 轮",
    group: "patch",
    userInput: "不用哑铃了，换一个",
    stateFixture: "recent_routine",
    expectation: {
      expectedAgentStatuses: ["patched"],
      expectedCardTypes: ["workout_patch"],
      forbidTrainingCards: false,
      requiredAgentTools: [
        "getArtifactPayload",
        "searchExercises",
        "proposeWorkoutPatch",
        "validateWorkoutPatch",
        "saveConversationArtifactRevision",
      ],
      forbiddenAgentTools: ["legacyIntentNormalize", "runReadonlyToolLoop"],
      requireCandidateSetId: true,
      requireValidationId: true,
      requireRevisionId: true,
      requireDependencyGraph: true,
      requireLegacyPathDisabled: true,
      maxRepairTurnCount: 1,
      note: "已有 routine 时，应读取 payload、检索替代候选、生成 patch、校验并保存新 revision。",
    },
  },
];

export function getAgentToolCallCases() {
  return agentToolCallCases;
}

export function getKnownAgentToolCallGroups() {
  return unique(agentToolCallCases.map((testCase) => testCase.group));
}

export function getKnownAgentToolCallStates() {
  return unique(agentToolCallCases.map((testCase) => testCase.stateFixture));
}

export function getKnownAgentToolCallStatuses() {
  return unique(agentToolCallCases.flatMap((testCase) => testCase.expectation.expectedAgentStatuses));
}

export function getKnownAgentToolCallTools() {
  return unique(agentToolCallCases.flatMap((testCase) => testCase.expectation.requiredAgentTools));
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}
