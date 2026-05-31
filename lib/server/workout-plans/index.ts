import "server-only";

export {
  aiWorkoutPlanChatMessageSchema,
  aiWorkoutPlanRequestSchema,
  generateAiWorkoutPlanDraft,
  type AiWorkoutPlanChatMessage,
  type AiWorkoutPlanFailure,
  type AiWorkoutPlanFailureCode,
  type AiWorkoutPlanRequest,
  type AiWorkoutPlanResult,
  type AiWorkoutPlanSuccess,
} from "./ai-workout-plan-service";

export {
  workoutDayDraftSchema,
  workoutExperienceSchema,
  workoutModeSchema,
  workoutPlanDraftSchema,
  workoutPlanIntentSchema,
  workoutPlanItemDraftSchema,
  type WorkoutDayDraft,
  type WorkoutExperience,
  type WorkoutMode,
  type WorkoutPlanDraft,
  type WorkoutPlanIntent,
  type WorkoutPlanItemDraft,
} from "@/lib/shared/workout-plans/draft-schema";

export {
  domainPlanSchedulePreviewEntrySchema,
  planIntensityBiasSchema,
  planProgressionPolicySchema,
  planStrategySchema,
  planStrategyTypeSchema,
  type DomainPlanSchedulePreviewEntry,
  type PlanIntensityBias,
  type PlanProgressionPolicy,
  type PlanStrategy,
  type PlanStrategyType,
} from "@/lib/shared/workout-plans/plan-strategy-schema";

export {
  buildPlanStrategyFromChatIntent,
  expandDomainPlan,
  getDraftExerciseIds,
  validatePlanDraftAgainstStrategy,
  type DomainPlanEngineInput,
  type DomainPlanEngineResult,
} from "./domain-plan-engine";

export {
  getCandidateExerciseIds,
  selectExerciseCandidates,
  selectExerciseCandidatesFromStore,
  validateWorkoutPlanDraftExerciseIds,
  validateWorkoutPlanDraftExerciseIdsFromStore,
  type ExerciseCandidate,
  type ExerciseCandidateOptions,
  type ExerciseCandidateResult,
  type ExerciseExposureSource,
  type ExcludedExercise,
  type RecommendationRelaxationOption,
  type RecommendationTrace,
  type WorkoutPlanExerciseIdValidationResult,
} from "./exercise-candidate-service";

export {
  validateWorkoutPlanDraft,
  validateWorkoutPlanDraftFromStore,
  type WorkoutPlanDayEstimate,
  type WorkoutPlanValidationIssue,
  type WorkoutPlanValidationIssueCode,
  type WorkoutPlanValidationOptions,
  type WorkoutPlanValidationResult,
} from "./workout-plan-validation-service";

export {
  classifyWorkoutPlanValidationFailure,
  isRecoverableWorkoutPlanIssue,
  type WorkoutPlanValidationRecovery,
} from "./workout-plan-validation-recovery-service";
