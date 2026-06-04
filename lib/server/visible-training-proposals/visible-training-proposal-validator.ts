import {
  TerminalOutputValidatorRegistry,
  type TerminalOutputValidator,
  type TerminalOutputValidationContext,
  type TerminalOutputValidationResult,
} from "@/lib/server/agent-core/terminal-output-validator";
import type { JsonValue, VisibleOutputEnvelope } from "@/lib/server/agent-core/contracts";

import {
  toJsonValue,
  visibleTrainingProposalOutputType,
  visibleTrainingProposalPayloadSchema,
  visibleTrainingProposalSchemaVersion,
} from "./visible-training-proposal-contract";
import {
  validateVisibleTrainingProposalExerciseFacts,
  type VisibleTrainingProposalExerciseFactLoader,
} from "./visible-training-proposal-exercise-facts";

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
  _context: TerminalOutputValidationContext,
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
      },
    };
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
