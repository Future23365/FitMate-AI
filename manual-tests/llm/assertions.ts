import { z } from "zod";

import { chatIntentSchema } from "@/lib/server/chat/chat-service";
import { workoutPlanDraftSchema, workoutPlanIntentSchema, workoutRoutineDraftSchema } from "@/lib/shared/workout-plans/draft-schema";

import type { LlmCaseExpectation, ManualLlmCase } from "./fixtures";

const recommendationOutputSchema = z.object({
  title: z.string().trim().min(1),
  goal: z.string().trim().min(1),
  summary: z.string().trim().optional(),
  items: z.array(z.object({
    exerciseId: z.string().trim().min(1),
    reasons: z.array(z.string().trim().min(1)).min(1),
  })).min(1),
  safetyNotes: z.array(z.string().trim().min(1)).default([]),
});

type ParsedOutput = z.infer<typeof recommendationOutputSchema> | Record<string, unknown>;
type JsonRecord = Record<string, unknown>;

// 解析模型 JSON 输出，兼容模型偶尔返回 fenced JSON 的情况。
export function parseJsonObject(content: string) {
  const normalized = content.trim();
  const jsonText = normalized.startsWith("```")
    ? normalized.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
    : normalized;

  return JSON.parse(jsonText) as unknown;
}

// 手动 LLM 测试的统一断言入口，根据 fixture 选择结构化或自然语言断言。
export function assertCaseOutput(testCase: ManualLlmCase, output: string) {
  const expectation = testCase.expectation;

  if (expectation.outputSchema) {
    const value = parseJsonObject(output);
    const parsed = parseStructuredOutput(testCase, value);
    assertStructuredExpectations(testCase, parsed);
    return;
  }

  assertNaturalLanguageExpectations(testCase, output);
}

function parseStructuredOutput(testCase: ManualLlmCase, value: unknown): ParsedOutput {
  const normalizedValue = normalizeNullableOptionalFields(value);

  switch (testCase.expectation.outputSchema) {
    case "chatIntent":
      return parseWithSchema(testCase, normalizedValue, chatIntentSchema);
    case "recommendation":
      return parseWithSchema(testCase, normalizedValue, recommendationOutputSchema);
    case "workoutIntent":
      return parseWithSchema(testCase, normalizedValue, workoutPlanIntentSchema);
    case "workoutPlanDraft":
      return parseWithSchema(testCase, normalizedValue, workoutPlanDraftSchema);
    case "workoutRoutineDraft":
      return parseWithSchema(testCase, normalizedValue, workoutRoutineDraftSchema);
    default:
      return normalizedValue as Record<string, unknown>;
  }
}

function normalizeNullableOptionalFields(value: unknown) {
  const record = asRecord(value);

  if (!record) {
    return value;
  }

  return {
    ...record,
    workoutIntent: record.workoutIntent === null ? undefined : record.workoutIntent,
  };
}

function parseWithSchema<T extends z.ZodType>(testCase: ManualLlmCase, value: unknown, schema: T): z.infer<T> {
  const parsed = schema.safeParse(value);

  if (!parsed.success) {
    failCase(testCase, "模型输出未通过 Schema 校验", {
      issues: parsed.error.flatten(),
      value,
    });
  }

  return parsed.data;
}

function assertStructuredExpectations(testCase: ManualLlmCase, output: ParsedOutput) {
  const expectation = testCase.expectation;
  const record = requireRecord(testCase, output);

  if (expectation.expectedType) {
    assertCondition(testCase, record.type === expectation.expectedType, "type 不符合预期", {
      expected: expectation.expectedType,
      actual: record.type,
    });
  }

  if (expectation.expectedIntentType) {
    const workoutIntent = asRecord(record.workoutIntent);
    const actualIntentType = record.intentType ?? workoutIntent?.intentType;
    assertCondition(testCase, actualIntentType === expectation.expectedIntentType, "intentType 不符合预期", {
      expected: expectation.expectedIntentType,
      actual: actualIntentType,
    });
  }

  if (typeof expectation.expectedCanTriggerAction === "boolean") {
    assertCondition(
      testCase,
      record.canTriggerAction === expectation.expectedCanTriggerAction,
      "canTriggerAction 不符合预期",
      {
        expected: expectation.expectedCanTriggerAction,
        actual: record.canTriggerAction,
      },
    );
  }

  if (expectation.requireNeedsExerciseContext) {
    assertCondition(testCase, record.needsExerciseContext === true, "needsExerciseContext 应为 true", output);
  } else if (expectation.expectedType === "non_fitness") {
    assertCondition(testCase, record.needsExerciseContext === false, "non_fitness 不应请求动作上下文", output);
    assertCondition(testCase, record.canTriggerAction === false, "non_fitness 不应触发训练生成动作", output);
  }

  if (expectation.requireMissingActionFields) {
    assertCondition(
      testCase,
      Array.isArray(record.missingActionFields) && record.missingActionFields.length > 0,
      "missingActionFields 应为非空数组",
      output,
    );
  }

  if (expectation.requireSuggestedReplies) {
    assertCondition(
      testCase,
      Array.isArray(record.suggestedReplies) && record.suggestedReplies.length > 0,
      "suggestedReplies 应为非空数组",
      output,
    );
  }

  if (expectation.requireFirstPersonSuggestedReplies && Array.isArray(record.suggestedReplies)) {
    const invalidReply = record.suggestedReplies.find(
      (reply) => typeof reply !== "string" || !/^我/.test(reply) || /[?？]$/.test(reply),
    );
    assertCondition(testCase, !invalidReply, "suggestedReplies 应为用户第一人称且不是疑问句", {
      suggestedReplies: record.suggestedReplies,
    });
  }

  if (expectation.requirePlanDays) {
    assertCondition(testCase, Array.isArray(record.days) && record.days.length > 0, "plan 草稿必须包含 days", output);
  }

  if (expectation.requirePlanSections) {
    const days = Array.isArray(record.days) ? record.days : [];

    for (const day of days) {
      const dayRecord = asRecord(day);

      if (dayRecord?.isRestDay === true) {
        continue;
      }

      const sections = Array.isArray(dayRecord?.sections)
        ? dayRecord.sections.map((section) => asRecord(section)?.section ?? "")
        : [];

      for (const section of ["warmup", "training", "stretch"]) {
        assertCondition(testCase, sections.includes(section), `plan 训练日缺少 ${section} 阶段`, {
          day: dayRecord,
          sections,
        });
      }
    }
  }

  if (typeof expectation.expectedCycleLengthDays === "number") {
    assertCondition(testCase, record.cycleLengthDays === expectation.expectedCycleLengthDays, "cycleLengthDays 不符合预期", {
      expected: expectation.expectedCycleLengthDays,
      actual: record.cycleLengthDays,
    });
  }

  if (typeof expectation.expectedCalendarHorizonDays === "number") {
    assertCondition(testCase, record.calendarHorizonDays === expectation.expectedCalendarHorizonDays, "calendarHorizonDays 不符合预期", {
      expected: expectation.expectedCalendarHorizonDays,
      actual: record.calendarHorizonDays,
    });
  }

  if (expectation.requireRoutineSections) {
    const sections = Array.isArray(record.sections)
      ? record.sections.map((section) => asRecord(section)?.section ?? "")
      : [];
    for (const section of ["warmup", "training", "stretch"]) {
      assertCondition(testCase, sections.includes(section), `routine 草稿缺少 ${section} 阶段`, { sections });
    }
  }

  if (expectation.requireCandidateExerciseIdsOnly) {
    assertExerciseIds(testCase, output, expectation);
  }
}

function assertExerciseIds(testCase: ManualLlmCase, output: ParsedOutput, expectation: LlmCaseExpectation) {
  const exerciseIds = collectExerciseIds(output);
  const allowed = new Set(expectation.allowedExerciseIds ?? []);
  const excluded = new Set(expectation.excludedExerciseIds ?? []);
  const invalidExerciseIds = exerciseIds.filter((exerciseId) => !allowed.has(exerciseId));
  const returnedExcludedIds = exerciseIds.filter((exerciseId) => excluded.has(exerciseId));

  assertCondition(testCase, invalidExerciseIds.length === 0, "模型返回了候选外 exerciseId", {
    exerciseIds,
    invalidExerciseIds,
    allowedExerciseIds: [...allowed],
  });
  assertCondition(testCase, returnedExcludedIds.length === 0, "模型返回了 excludedExerciseIds 中的动作", {
    exerciseIds,
    returnedExcludedIds,
    excludedExerciseIds: [...excluded],
  });
}

function collectExerciseIds(output: ParsedOutput) {
  const record = asRecord(output);

  if (!record) {
    return [];
  }

  if (Array.isArray(record.items)) {
    return collectExerciseIdsFromItems(record.items);
  }

  if (Array.isArray(record.days)) {
    return record.days.flatMap((day) => {
      const dayRecord = asRecord(day);

      if (Array.isArray(dayRecord?.sections)) {
        return dayRecord.sections.flatMap((section) => {
          const sectionRecord = asRecord(section);

          return Array.isArray(sectionRecord?.items) ? collectExerciseIdsFromItems(sectionRecord.items) : [];
        });
      }

      return Array.isArray(dayRecord?.items) ? collectExerciseIdsFromItems(dayRecord.items) : [];
    });
  }

  if (Array.isArray(record.sections)) {
    return record.sections.flatMap((section) => {
      const sectionRecord = asRecord(section);

      return Array.isArray(sectionRecord?.items) ? collectExerciseIdsFromItems(sectionRecord.items) : [];
    });
  }

  return [];
}

function collectExerciseIdsFromItems(items: unknown[]) {
  return items
    .map((item) => asRecord(item)?.exerciseId)
    .filter((exerciseId): exerciseId is string => typeof exerciseId === "string");
}

function assertNaturalLanguageExpectations(testCase: ManualLlmCase, output: string) {
  const expectation = testCase.expectation;

  for (const text of expectation.forbiddenText ?? []) {
    assertCondition(testCase, !output.includes(text), "自然语言正文命中禁止文本", { forbiddenText: text, output });
  }

  for (const pattern of expectation.forbiddenPatterns ?? []) {
    assertCondition(testCase, !pattern.test(output), "自然语言正文命中禁止模式", {
      forbiddenPattern: pattern.toString(),
      output,
    });
  }

  for (const pattern of expectation.requiredTextPatterns ?? []) {
    assertCondition(testCase, pattern.test(output), "自然语言正文缺少必要语义", {
      requiredPattern: pattern.toString(),
      output,
    });
  }

  if (expectation.requireDoctorSafetyAdvice) {
    assertCondition(testCase, /医生|医师|专业人士|就医|医疗/.test(output), "高风险健康场景必须提醒咨询专业人士", {
      output,
    });
  }
}

function assertCondition(testCase: ManualLlmCase, condition: unknown, message: string, detail?: unknown): asserts condition {
  if (!condition) {
    failCase(testCase, message, detail);
  }
}

function asRecord(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function requireRecord(testCase: ManualLlmCase, value: unknown): JsonRecord {
  const record = asRecord(value);

  if (!record) {
    failCase(testCase, "模型输出不是 JSON 对象", value);
  }

  return record;
}

function failCase(testCase: ManualLlmCase, reason: string, detail?: unknown): never {
  throw new Error(
    JSON.stringify(
      {
        callSite: testCase.callSite,
        caseName: testCase.name,
        inputSummary: testCase.inputSummary,
        reason,
        detail,
      },
      null,
      2,
    ),
  );
}
