export type AgentSingleToolGroup =
  | "readonly"
  | "planning"
  | "generation"
  | "validation"
  | "policy"
  | "persistence"
  | "clarification";

export type AgentSingleToolResources = {
  artifactId: string;
  artifactPayloadId: string;
  exerciseId: string;
  candidateSetId: string;
  candidateExerciseIds: string[];
  routineDraftId: string;
  planDraftId: string;
  routineValidationId: string;
  planValidationId: string;
  editPlan: unknown;
  patch: unknown;
  patchId: string;
  patchValidationId: string;
  policyDecisionId: string;
  routineIntent: unknown;
  planIntent: unknown;
  planStrategy: unknown;
  responseMessageId: string;
};

export type AgentSingleToolCase = {
  id: string;
  toolName: string;
  group: AgentSingleToolGroup;
  scenario: string;
  setup: string[];
  expectedOutputFields: string[];
  buildExpectedInput(resources: AgentSingleToolResources): unknown;
  note: string;
};

// 单工具 fixture 覆盖当前 AgentToolRegistry 的每个已注册工具；每个 case 只允许 LLM 产出一个 call_tool。
export const agentSingleToolCases: AgentSingleToolCase[] = [
  {
    id: "TOOL01",
    toolName: "listRecentArtifacts",
    group: "readonly",
    scenario: "列出当前会话最近 artifact 摘要。",
    setup: ["artifact"],
    expectedOutputFields: ["candidateSetId", "artifacts"],
    buildExpectedInput: () => ({
      sessionScope: "current_session",
      kind: "routine",
      limit: 6,
    }),
    note: "验证 listRecentArtifacts 能读取真实 ArtifactIndex 并返回候选集合 id。",
  },
  {
    id: "TOOL02",
    toolName: "searchArtifacts",
    group: "readonly",
    scenario: "按结构化条件检索最近 routine artifact。",
    setup: ["artifact"],
    expectedOutputFields: ["candidateSetId", "candidates"],
    buildExpectedInput: () => ({
      candidateUse: "answer_only",
      sessionScope: "current_session",
      kind: "routine",
      targetGoal: "上肢力量训练",
      limit: 6,
    }),
    note: "验证 searchArtifacts 的结构化 artifact 检索能命中当前用户当前会话数据。",
  },
  {
    id: "TOOL03",
    toolName: "resolveArtifactReference",
    group: "readonly",
    scenario: "解析当前会话唯一的 routine 引用。",
    setup: ["artifact"],
    expectedOutputFields: ["artifactReferenceId", "artifactId"],
    buildExpectedInput: () => ({
      operation: "resolve_artifact_reference",
      referenceKind: "latest",
      sessionScope: "current_session",
      kind: "routine",
      targetGoal: "上肢力量训练",
      requireUnique: true,
      limit: 4,
    }),
    note: "验证 resolveArtifactReference 在唯一匹配时能产出 artifactReferenceId 和 artifactId。",
  },
  {
    id: "TOOL04",
    toolName: "getArtifactPayload",
    group: "readonly",
    scenario: "读取指定 routine artifact 的完整 payload。",
    setup: ["artifact"],
    expectedOutputFields: ["artifactPayloadId", "payload"],
    buildExpectedInput: (resources) => ({
      artifactId: resources.artifactId,
      allowedArtifactIds: [resources.artifactId],
    }),
    note: "验证 getArtifactPayload 能读取当前用户可访问 artifact，并生成 payload 资源 id。",
  },
  {
    id: "TOOL05",
    toolName: "getExerciseById",
    group: "readonly",
    scenario: "读取动作库中指定 exerciseId 的动作详情。",
    setup: ["exercise"],
    expectedOutputFields: ["exercise"],
    buildExpectedInput: (resources) => ({
      exerciseId: resources.exerciseId,
    }),
    note: "验证 getExerciseById 能读取真实动作库记录。",
  },
  {
    id: "TOOL06",
    toolName: "searchExercises",
    group: "readonly",
    scenario: "按上肢 routine 用途构建动作候选集合。",
    setup: [],
    expectedOutputFields: ["candidateSetId", "candidates"],
    buildExpectedInput: () => createRoutineCandidateSearchInput(),
    note: "验证 searchExercises 能用结构化过滤生成可执行 candidateSetId。",
  },
  {
    id: "TOOL07",
    toolName: "getUserMemory",
    group: "readonly",
    scenario: "读取当前用户画像和已确认记忆摘要。",
    setup: ["memory"],
    expectedOutputFields: ["snapshotId"],
    buildExpectedInput: () => ({
      includePending: false,
      limit: 12,
    }),
    note: "验证 getUserMemory 能读取当前用户结构化记忆快照。",
  },
  {
    id: "TOOL08",
    toolName: "queryUserMemory",
    group: "readonly",
    scenario: "按结构化过滤查询当前用户器械偏好记忆。",
    setup: ["memory"],
    expectedOutputFields: ["memoryQueryId", "matchedMemories"],
    buildExpectedInput: () => ({
      operation: "query_user_memory",
      filters: {
        kind: ["explicit_preference"],
        subjectType: ["equipment"],
        status: ["active"],
        confirmed: true,
        source: ["chat"],
      },
      limit: 12,
      projection: {
        includeValue: true,
        fields: ["kind", "subjectType", "subjectLabel", "value"],
      },
    }),
    note: "验证 queryUserMemory 能按确定性字段命中当前用户记忆。",
  },
  {
    id: "TOOL09",
    toolName: "proposeWorkoutEditPlan",
    group: "planning",
    scenario: "基于已读取 routine payload 编译替换哑铃动作的 edit plan。",
    setup: ["artifactPayload"],
    expectedOutputFields: ["editPlanId"],
    buildExpectedInput: (resources) => ({
      targetArtifactId: resources.artifactId,
      sourceArtifactPayloadId: resources.artifactPayloadId,
      allowedArtifactPayloadIds: [resources.artifactPayloadId],
      requestedChangeSummary: "不用哑铃了，替换为自重上肢动作。",
      preserve: [
        { kind: "duration", summary: "保留 30 分钟训练时长。" },
        { kind: "location", summary: "保留居家训练场景。" },
      ],
      changes: [
        { kind: "equipment", summary: "排除哑铃，改用自重或无器械动作。" },
      ],
      scope: "whole_routine",
      strategy: "patch",
      requiredCandidateSetIds: [],
      confirmationLevel: "none",
    }),
    note: "验证 proposeWorkoutEditPlan 能把已读 payload 和修改要求编译成 editPlanId。",
  },
  {
    id: "TOOL10",
    toolName: "generateRoutineDraft",
    group: "generation",
    scenario: "用候选集合生成单次 routine draft。",
    setup: ["candidateSet"],
    expectedOutputFields: ["draftId", "candidateSetId", "draft", "validation"],
    buildExpectedInput: (resources) => ({
      intent: resources.routineIntent,
      candidateSetId: resources.candidateSetId,
      candidateExerciseIds: resources.candidateExerciseIds,
      title: "单工具测试上肢 routine",
    }),
    note: "验证 generateRoutineDraft 只能消费当前 run 的候选集合并产出 draftId。",
  },
  {
    id: "TOOL11",
    toolName: "generatePlanDraft",
    group: "generation",
    scenario: "用候选集合和 PlanStrategy 生成长期 plan draft。",
    setup: ["candidateSet"],
    expectedOutputFields: ["draftId", "candidateSetId", "draft", "validation"],
    buildExpectedInput: (resources) => ({
      intent: resources.planIntent,
      candidateSetId: resources.candidateSetId,
      candidateExerciseIds: resources.candidateExerciseIds,
      strategy: resources.planStrategy,
    }),
    note: "验证 generatePlanDraft 能从策略和候选集合展开 plan draft。",
  },
  {
    id: "TOOL12",
    toolName: "proposeWorkoutPatch",
    group: "planning",
    scenario: "基于 edit plan 和候选集合编译 WorkoutPatch。",
    setup: ["editPlan", "candidateSet"],
    expectedOutputFields: ["patchId", "candidateSetId", "patch"],
    buildExpectedInput: (resources) => ({
      editPlan: resources.editPlan,
      candidateSetId: resources.candidateSetId,
      candidateExerciseIds: resources.candidateExerciseIds,
      patch: resources.patch,
    }),
    note: "验证 proposeWorkoutPatch 能校验 editPlan、候选集合和 patch 结构。",
  },
  {
    id: "TOOL13",
    toolName: "askClarification",
    group: "clarification",
    scenario: "生成缺少训练条件时的澄清问题。",
    setup: [],
    expectedOutputFields: ["question"],
    buildExpectedInput: () => ({
      question: "你这次训练想重点练哪个部位？",
      blockingReasons: ["缺少目标部位，无法安全生成训练。"],
      assistantSuggestions: [
        { label: "练胸", message: "今天练胸，20分钟。" },
        { label: "练腿", message: "今天练腿，20分钟。" },
      ],
    }),
    note: "验证 askClarification 能返回结构化澄清问题而不读写数据。",
  },
  {
    id: "TOOL14",
    toolName: "validateRoutineDraft",
    group: "validation",
    scenario: "校验已登记 routine draft。",
    setup: ["routineDraft"],
    expectedOutputFields: ["validationId", "valid"],
    buildExpectedInput: (resources) => ({
      draftId: resources.routineDraftId,
      candidateSetId: resources.candidateSetId,
      candidateExerciseIds: resources.candidateExerciseIds,
      intent: resources.routineIntent,
    }),
    note: "验证 validateRoutineDraft 只能读取本轮已登记 draft 和 candidateSet。",
  },
  {
    id: "TOOL15",
    toolName: "validatePlanDraft",
    group: "validation",
    scenario: "校验已登记 plan draft。",
    setup: ["planDraft"],
    expectedOutputFields: ["validationId", "valid"],
    buildExpectedInput: (resources) => ({
      draftId: resources.planDraftId,
      candidateSetId: resources.candidateSetId,
      candidateExerciseIds: resources.candidateExerciseIds,
      intent: resources.planIntent,
    }),
    note: "验证 validatePlanDraft 只能读取本轮已登记 plan draft 和 candidateSet。",
  },
  {
    id: "TOOL16",
    toolName: "validateWorkoutPatch",
    group: "validation",
    scenario: "校验已登记 WorkoutPatch。",
    setup: ["patch"],
    expectedOutputFields: ["validationId", "valid"],
    buildExpectedInput: (resources) => ({
      patchId: resources.patchId,
      candidateSetId: resources.candidateSetId,
      candidateExerciseIds: resources.candidateExerciseIds,
      patch: resources.patch,
    }),
    note: "验证 validateWorkoutPatch 能校验 patch 目标和 replacement 候选边界。",
  },
  {
    id: "TOOL17",
    toolName: "evaluatePolicy",
    group: "policy",
    scenario: "评估新 routine artifact 写入 policy。",
    setup: ["routineDraft"],
    expectedOutputFields: ["policyDecisionId", "policy"],
    buildExpectedInput: (resources) => ({
      policyTarget: "new_artifact",
      artifactKind: "routine",
      draftId: resources.routineDraftId,
    }),
    note: "验证 evaluatePolicy 能对已登记 draft 产出 policyDecisionId。",
  },
  {
    id: "TOOL18",
    toolName: "saveConversationArtifactRevision",
    group: "persistence",
    scenario: "保存已校验并通过 policy 的 routine draft。",
    setup: ["routineValidation", "policyDecision"],
    expectedOutputFields: ["revisionId", "artifactId"],
    buildExpectedInput: (resources) => ({
      artifactKind: "routine",
      candidateSetId: resources.candidateSetId,
      validationId: resources.routineValidationId,
      policyDecisionId: resources.policyDecisionId,
      draftId: resources.routineDraftId,
      validationPassed: true,
      policyAllowed: true,
      responseMessageId: resources.responseMessageId,
    }),
    note: "验证 saveConversationArtifactRevision 只保存已校验且 policy 允许的 draft。",
  },
];

export function getAgentSingleToolCases() {
  return agentSingleToolCases;
}

export function getKnownAgentSingleToolGroups() {
  return unique(agentSingleToolCases.map((testCase) => testCase.group));
}

export function getKnownAgentSingleToolNames() {
  return unique(agentSingleToolCases.map((testCase) => testCase.toolName));
}

export function createRoutineCandidateSearchInput() {
  return {
    operation: "build_exercise_candidate_set",
    candidateUse: "routine",
    limit: 8,
    visibility: "all",
    filters: {
      bodyRegions: ["upper_body"],
      allowedSections: ["warmup", "training", "stretch"],
      visibility: "all",
    },
    resultRequirements: {
      minCandidates: 3,
      sectionCoverage: {
        warmup: { min: 1 },
        training: { min: 1 },
        stretch: { min: 1 },
      },
      mustBeUsableFor: "routine",
      requireProof: true,
    },
    projection: {
      maxCandidatesForModel: 8,
    },
  };
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}
