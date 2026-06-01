export type AgentReadToolBudget = {
  maxSteps: number;
  maxDecisionCalls: number;
  timeoutMs: number;
  maxBundleChars: number;
  maxFreeTextChars: number;
  searchArtifactsMaxResults: number;
  searchExercisesMaxResults: number;
};

export const readonlyToolVersions = {
  searchArtifacts: "2026-05-31.readonly-search-artifacts-v1",
  getArtifactPayload: "2026-05-31.readonly-artifact-payload-v1",
  getExerciseById: "2026-05-31.readonly-exercise-by-id-v1",
  searchExercises: "2026-05-31.readonly-search-exercises-v1",
} as const;

// Agent 读工具预算集中定义，避免 registry、执行器和 trace 对限制产生分叉。
export const defaultReadonlyToolBudget: AgentReadToolBudget = {
  maxSteps: 3,
  maxDecisionCalls: 3,
  timeoutMs: 8_000,
  maxBundleChars: 6_000,
  maxFreeTextChars: 300,
  searchArtifactsMaxResults: 12,
  searchExercisesMaxResults: 24,
};

export const defaultSearchArtifactsLimit = 6;
export const defaultSearchExercisesLimit = 8;
