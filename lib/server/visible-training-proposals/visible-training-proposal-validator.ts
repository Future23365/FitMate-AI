import {
  TerminalOutputValidatorRegistry,
  type TerminalOutputValidator,
  type TerminalOutputValidationContext,
  type TerminalOutputValidationResult,
} from "@/lib/server/agent-core/terminal-output-validator";
import type { JsonValue, VisibleOutputEnvelope } from "@/lib/server/agent-core/contracts";

import {
  toJsonValue,
  visibleTrainingProposalFactResourceType,
  visibleTrainingProposalOutputType,
  visibleTrainingProposalPayloadSchema,
  visibleTrainingProposalSchemaVersion,
  type VisibleTrainingExerciseItem,
} from "./visible-training-proposal-contract";
import {
  validateVisibleTrainingProposalExerciseFacts,
  type VisibleTrainingProposalExerciseFactLoader,
} from "./visible-training-proposal-exercise-facts";
import {
  isVisibleTrainingCompositionSection,
  summarizeVisibleTrainingResourceCoverage,
  visibleTrainingCompositionSections,
  type VisibleTrainingCompositionSection,
} from "./visible-training-resource-coverage";

type VisibleTrainingProposalValidatorOptions = {
  loadExerciseRecordsByIds?: VisibleTrainingProposalExerciseFactLoader;
};

/** createVisibleTrainingProposalValidator 校验训练方案 payload 结构，并通过注入的动作事实服务复核数据库边界。 */
export function createVisibleTrainingProposalValidator(
  options: VisibleTrainingProposalValidatorOptions = {},
): TerminalOutputValidator {
  return {
    outputType: visibleTrainingProposalOutputType,
    schemaVersions: [visibleTrainingProposalSchemaVersion],
    validate: (output, context) => validateVisibleTrainingProposalOutput(output, context, options),
  };
}

/** createProductionTerminalOutputValidatorRegistry 装配生产聊天允许的用户可见结构化输出 validator。 */
export function createProductionTerminalOutputValidatorRegistry(
  options: VisibleTrainingProposalValidatorOptions = {},
) {
  const registry = new TerminalOutputValidatorRegistry();
  registry.register(createVisibleTrainingProposalValidator(options));
  return registry;
}

/** validateVisibleTrainingProposalOutput 是 visibleTrainingProposal 的终态输出安全边界，不读取用户原文。 */
export async function validateVisibleTrainingProposalOutput(
  output: VisibleOutputEnvelope,
  context: TerminalOutputValidationContext,
  options: VisibleTrainingProposalValidatorOptions = {},
): Promise<TerminalOutputValidationResult> {
  const legacyIdPath = findLegacyIdField(output.payload);
  if (legacyIdPath) {
    return {
      ok: false,
      message: "visibleTrainingProposal 动作项必须使用 exerciseId，不能输出 id。",
      details: { path: legacyIdPath },
    };
  }

  const coverageFailure = createRoutinePlanCoverageFailure(output.payload, context);
  if (coverageFailure) {
    return coverageFailure;
  }

  const parsed = visibleTrainingProposalPayloadSchema.safeParse(output.payload);
  if (!parsed.success) {
    return {
      ok: false,
      message: "visibleTrainingProposal payload 不符合 schema。",
      details: {
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
    };
  }

  const exerciseValidation = await validateVisibleTrainingProposalExerciseFacts({
    exerciseItems: parsed.data.exerciseItems,
    loadExerciseRecordsByIds: options.loadExerciseRecordsByIds,
  });
  if (!exerciseValidation.ok) {
    return {
      ok: false,
      message: exerciseValidation.message,
      details: {
        code: exerciseValidation.code,
        ...asObjectDetails(exerciseValidation.details),
        outputCoverage: summarizeVisibleTrainingResourceCoverage({
          exerciseItems: parsed.data.exerciseItems,
          hasSchedule: Boolean(parsed.data.schedule),
        }),
        currentVisibleCoverage: summarizeCurrentVisibleTrainingCoverage(context),
        recoveryDirections: createCoverageRecoveryDirections(),
      },
    };
  }

  const sourceValidation = validateCurrentRunExerciseSources(parsed.data.exerciseItems, context);
  if (!sourceValidation.ok) {
    return sourceValidation;
  }

  return {
    ok: true,
    metadata: toJsonValue({
      exerciseDetails: exerciseValidation.exerciseDetails,
    }),
  };
}

function asObjectDetails(details: JsonValue): Record<string, JsonValue> {
  return details && typeof details === "object" && !Array.isArray(details)
    ? details
    : { details };
}

function createRoutinePlanCoverageFailure(
  payload: JsonValue,
  context: TerminalOutputValidationContext,
): TerminalOutputValidationResult | null {
  if (!isRecord(payload) || (payload.kind !== "routine" && payload.kind !== "plan")) {
    return null;
  }

  const exerciseItems = readExerciseSections(payload.exerciseItems);
  if (!exerciseItems) {
    return null;
  }

  const outputCoverage = summarizeVisibleTrainingResourceCoverage({
    exerciseItems,
    hasSchedule: isRecord(payload.schedule),
  });
  if (outputCoverage.missingSectionsForRoutineOrPlan.length === 0) {
    return null;
  }

  return {
    ok: false,
    message: "visibleTrainingProposal 缺少 routine 或 plan 必要 section。",
    details: {
      code: "section_coverage_missing",
      path: "payload.exerciseItems",
      payloadKind: payload.kind,
      outputCoverage,
      availableSections: outputCoverage.availableSections,
      missingSectionsForRoutineOrPlan: outputCoverage.missingSectionsForRoutineOrPlan,
      currentVisibleCoverage: summarizeCurrentVisibleTrainingCoverage(context),
      recoveryDirections: createCoverageRecoveryDirections(),
    },
  };
}

function summarizeCurrentVisibleTrainingCoverage(context: TerminalOutputValidationContext) {
  const sections = new Set<VisibleTrainingCompositionSection>();

  for (const result of context.toolResults) {
    if (result.ok) {
      collectSectionsFromJson(result.projection.model, sections);
    }
  }

  for (const resource of context.resourceStore?.inventory() ?? []) {
    collectSectionsFromJson(resource.summary, sections);
  }

  return summarizeVisibleTrainingResourceCoverage({
    exerciseItems: [...sections].map((section) => ({ section })),
  });
}

function collectSectionsFromJson(value: JsonValue | undefined, sections: Set<VisibleTrainingCompositionSection>) {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectSectionsFromJson(item, sections);
    }
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  if (isVisibleTrainingCompositionSection(value.section)) {
    sections.add(value.section);
  }

  if (Array.isArray(value.availableSections)) {
    for (const candidate of value.availableSections) {
      if (isVisibleTrainingCompositionSection(candidate)) {
        sections.add(candidate);
      }
    }
  }

  if (isRecord(value.sectionSummary)) {
    for (const candidate of visibleTrainingCompositionSections) {
      if (typeof value.sectionSummary[candidate] === "number" && value.sectionSummary[candidate] > 0) {
        sections.add(candidate);
      }
    }
  }

  if (isRecord(value.groups)) {
    for (const candidate of visibleTrainingCompositionSections) {
      const group = value.groups[candidate];
      if (isRecord(group) && Array.isArray(group.exercises) && group.exercises.length > 0) {
        sections.add(candidate);
      }
    }
  }

  for (const child of Object.values(value)) {
    collectSectionsFromJson(child, sections);
  }
}

function readExerciseSections(value: JsonValue | undefined): Array<Pick<VisibleTrainingExerciseItem, "section">> | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const sections: Array<Pick<VisibleTrainingExerciseItem, "section">> = [];
  for (const item of value) {
    if (!isRecord(item) || !isVisibleTrainingCompositionSection(item.section)) {
      return null;
    }
    sections.push({ section: item.section });
  }

  return sections;
}

function createCoverageRecoveryDirections(): JsonValue {
  return [
    "继续获取缺失 section 的可消费动作事实。",
    "如要输出 routine 或 plan，先让当前 run 具备 warmup、training、stretch 三类可消费动作事实。",
    "不要再次提交缺少 warmup、training 或 stretch 的 routine / plan visibleOutputs。",
    "输出当前事实可支撑的结构。",
    "向用户澄清缺失条件或可放宽边界。",
    "在事实不足时失败收口，不保存或渲染不可验证方案。",
  ];
}

function validateCurrentRunExerciseSources(
  exerciseItems: readonly Pick<VisibleTrainingExerciseItem, "exerciseId" | "section" | "order">[],
  context: TerminalOutputValidationContext,
): TerminalOutputValidationResult {
  const sources = collectCurrentRunExerciseSources(context);
  const missingItems = exerciseItems.filter((item) => !sources.has(createExerciseSourceKey(item)));

  if (missingItems.length === 0) {
    return { ok: true };
  }

  return {
    ok: false,
    message: "visibleTrainingProposal 动作项缺少当前 run 可消费动作事实来源。",
    details: {
      code: "current_run_source_missing",
      path: "payload.exerciseItems",
      missingExerciseItems: missingItems.map((item) => ({
        exerciseId: item.exerciseId,
        section: item.section,
        order: item.order,
      })),
      currentRunSourceSummary: {
        sourceCount: sources.size,
      },
      recoveryDirections: createCurrentRunSourceRecoveryDirections(),
    },
  };
}

// collectCurrentRunExerciseSources 只读取当前 run 的 satisfied tool result 和 consumable resource，不解释用户原文。
function collectCurrentRunExerciseSources(context: TerminalOutputValidationContext) {
  const sources = new Set<string>();

  for (const result of context.toolResults) {
    if (!result.ok || !result.fulfillment.satisfied || result.toolName !== "searchExerciseResources") {
      continue;
    }

    collectSourcesFromSearchProjection(result.projection.model, sources);
  }

  for (const resource of context.resourceStore?.inventory() ?? []) {
    if (
      resource.ref.role !== "consumable"
      || resource.ref.resourceType !== visibleTrainingProposalFactResourceType
    ) {
      continue;
    }

    collectSourcesFromExerciseItems(resource.summary, sources);
  }

  return sources;
}

function collectSourcesFromSearchProjection(value: JsonValue | undefined, sources: Set<string>) {
  if (!isRecord(value) || !isRecord(value.groups)) {
    return;
  }

  for (const section of visibleTrainingCompositionSections) {
    const group = value.groups[section];
    if (!isRecord(group) || !Array.isArray(group.exercises)) {
      continue;
    }

    for (const exercise of group.exercises) {
      if (isRecord(exercise) && typeof exercise.exerciseId === "string") {
        sources.add(createExerciseSourceKey({ exerciseId: exercise.exerciseId, section }));
      }
    }
  }
}

function collectSourcesFromExerciseItems(value: JsonValue | undefined, sources: Set<string>) {
  if (!isRecord(value) || !Array.isArray(value.exerciseItems)) {
    return;
  }

  for (const item of value.exerciseItems) {
    if (
      isRecord(item)
      && typeof item.exerciseId === "string"
      && isVisibleTrainingCompositionSection(item.section)
    ) {
      sources.add(createExerciseSourceKey({
        exerciseId: item.exerciseId,
        section: item.section,
      }));
    }
  }
}

function createExerciseSourceKey(item: Pick<VisibleTrainingExerciseItem, "exerciseId" | "section">) {
  return `${item.section}:${item.exerciseId}`;
}

function createCurrentRunSourceRecoveryDirections(): JsonValue {
  return [
    "继续查询当前目标所需的发布态动作事实，并使用 satisfied tool result 中的 exerciseId 和 section。",
    "如需复用上一轮用户可见训练方案，先导入对应 consumable visible_training_proposal_fact。",
    "不要从数据库记忆、metadata-only summary、unsatisfied tool result 或正文中直接复制动作到 visibleOutputs。",
    "当前事实不足时使用 ask_user 澄清，或不输出 visibleOutputs 并失败收口。",
  ];
}

function isRecord(value: JsonValue | undefined): value is Record<string, JsonValue> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function findLegacyIdField(payload: JsonValue) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const exerciseItems = (payload as Record<string, JsonValue>).exerciseItems;
  if (!Array.isArray(exerciseItems)) {
    return null;
  }

  for (const [index, item] of exerciseItems.entries()) {
    if (item && typeof item === "object" && !Array.isArray(item) && "id" in item) {
      return `payload.exerciseItems[${index}].id`;
    }
  }

  return null;
}
