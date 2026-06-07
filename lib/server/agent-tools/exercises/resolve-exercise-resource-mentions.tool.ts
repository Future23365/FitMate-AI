import { z } from "zod";

import { defineTool } from "@/lib/server/agent-core/define-tool";
import { agentRuntimeConfig } from "@/lib/server/config";
import {
  resolveExerciseResourceMentionSummaries,
  type ExerciseResourceMentionResolutionResult,
  type ExerciseResourceSummary,
} from "@/lib/server/exercises/exercise-repository";
import { exerciseAllowedSectionSchema } from "@/lib/shared/exercises/types";

const maxMentionCount = 12;

const mentionInputSchema = z.object({
  text: z.string()
    .trim()
    .min(1)
    .max(80)
    .describe("模型从用户表达中结构化提取出的单个动作点名文本；不要传入完整用户消息、历史摘要或多个动作拼成的长句。"),
  sectionHint: exerciseAllowedSectionSchema
    .optional()
    .describe("可选动作用途提示，只允许 warmup、training 或 stretch；该字段只辅助模型理解结果，不替代数据库 allowedSections。"),
}).strict();

const resolveExerciseResourceMentionsInputSchema = z.object({
  mentions: z.array(mentionInputSchema)
    .min(1)
    .max(maxMentionCount)
    .describe("用户明确点名的动作数组，由模型负责从自然语言中结构化提取；服务端只处理这里的文本。"),
}).strict();

const exerciseMentionSummarySchema = z.object({
  exerciseId: z.string().min(1),
  nameEn: z.string(),
  nameZh: z.string(),
  categoryZh: z.string().nullable(),
  levelZh: z.string().nullable(),
  equipmentZh: z.string().nullable(),
  homeRequirementZh: z.string(),
  primaryMusclesZh: z.array(z.string()),
  allowedSections: z.array(exerciseAllowedSectionSchema),
  imageUrl: z.string().nullable(),
  reviewStatus: z.string(),
  isPublished: z.literal(true),
}).strict();

const mentionDiagnosticSchema = z.object({
  code: z.enum(["mention_ambiguous", "mention_not_found"]),
  message: z.string(),
  text: z.string(),
  sectionHint: exerciseAllowedSectionSchema.optional(),
}).strict();

const mentionResolutionResultSchema = z.object({
  text: z.string(),
  sectionHint: exerciseAllowedSectionSchema.optional(),
  status: z.enum(["matched", "ambiguous", "not_found"]),
  totalMatches: z.number().int().min(0),
  returnedCount: z.number().int().min(0),
  truncated: z.boolean(),
  matches: z.array(exerciseMentionSummarySchema),
  diagnostics: z.array(mentionDiagnosticSchema),
}).strict();

const resolveExerciseResourceMentionsOutputSchema = z.object({
  status: z.literal("succeeded"),
  mentionCount: z.number().int().min(0),
  matchedCount: z.number().int().min(0),
  ambiguousCount: z.number().int().min(0),
  notFoundCount: z.number().int().min(0),
  results: z.array(mentionResolutionResultSchema),
}).strict();

type ResolveExerciseResourceMentionsInput = z.infer<typeof resolveExerciseResourceMentionsInputSchema>;
type ResolveExerciseResourceMentionsOutput = z.infer<typeof resolveExerciseResourceMentionsOutputSchema>;
type MentionInput = z.infer<typeof mentionInputSchema>;
type MentionResolutionOutput = z.infer<typeof mentionResolutionResultSchema>;
type ExerciseMentionSummaryOutput = z.infer<typeof exerciseMentionSummarySchema>;

/** resolveExerciseResourceMentionsTool 是生产 Agent 用于解析用户点名动作到 Exercise 资源的只读能力。 */
export const resolveExerciseResourceMentionsTool = defineTool<
  ResolveExerciseResourceMentionsInput,
  ResolveExerciseResourceMentionsOutput
>({
  name: "resolveExerciseResourceMentions",
  version: "0.3.0",
  description: "把用户明确点名的单个动作名解析为发布态 Exercise 候选，返回 matched、ambiguous 或 not_found。",
  whenToUse: [
    "用户明确说出动作名，并且后续需要确认动作库中是否存在时使用。",
    "mentions[].text 只放单个动作名；mentions[].sectionHint 可选，只能是 warmup、training 或 stretch。",
    "matched exerciseId 只能作为后续 searchExerciseResources.requiredExerciseIds，让这些发布态动作优先进入 section-scoped groups。",
    "ambiguous 需要模型选择候选、重新查询或 ask_user；not_found 不能作为动作事实。",
    "本 tool result 不能直接写入 visibleTrainingProposal.exerciseItems；最终动作事实仍需来自 searchExerciseResources.groups.<section>.exercises[] 或已导入的训练业务事实。",
  ].join(" "),
  whenNotToUse: [
    "不要把完整用户消息、conversationSummary、历史自然语言、分页、userId、sql、candidateUse、resultRequirements 或训练生成参数传给本 tool。",
    "mentions 必须由用户明确点名的动作构成；不要从泛泛目标、肌群、训练目的或器械条件中猜动作名。",
    "不要把 not_found 或 ambiguous 结果直接当作 visibleTrainingProposal 动作来源；需要澄清、选择候选或重新查询。",
  ].join(" "),
  inputSchema: resolveExerciseResourceMentionsInputSchema,
  outputSchema: resolveExerciseResourceMentionsOutputSchema,
  // uiActivityStage 说明该解析能力属于动作库查询进度，不泄漏具体 toolName 到用户界面。
  uiActivityStage: "querying_exercises",
  policy: {
    sideEffect: "read",
    riskLevel: "low",
    confirmation: "never",
    timeoutMs: agentRuntimeConfig.tools.resolveExerciseResourceMentions.timeoutMs,
  },
  examples: [
    {
      description: "解析用户明确点名的多个主训练动作，后续把 matched exerciseId 传给 searchExerciseResources.requiredExerciseIds。",
      action: {
        type: "tool_call",
        toolName: "resolveExerciseResourceMentions",
        input: {
          mentions: [
            { text: "俯卧撑", sectionHint: "training" },
            { text: "深蹲", sectionHint: "training" },
            { text: "平板支撑", sectionHint: "training" },
          ],
        },
      },
    },
    {
      description: "解析单个可能歧义的动作名；如果返回 ambiguous，模型应选择候选、重查或向用户澄清。",
      action: {
        type: "tool_call",
        toolName: "resolveExerciseResourceMentions",
        input: {
          mentions: [
            { text: "划船", sectionHint: "training" },
          ],
        },
      },
    },
  ],
  handler: async (input) => {
    const resolved = await Promise.all(input.mentions.map(async (mention) => {
      const result = await resolveExerciseResourceMentionSummaries({
        text: mention.text,
        maxMatches: agentRuntimeConfig.tools.resolveExerciseResourceMentions.maxMatches,
      });
      return toMentionResolutionOutput(mention, result);
    }));

    return {
      status: "succeeded",
      mentionCount: input.mentions.length,
      matchedCount: resolved.filter((result) => result.status === "matched").length,
      ambiguousCount: resolved.filter((result) => result.status === "ambiguous").length,
      notFoundCount: resolved.filter((result) => result.status === "not_found").length,
      results: resolved,
    };
  },
  toFulfillment: (output) => ({
    satisfied: true,
    summary: `解析 ${output.mentionCount} 个点名动作：命中 ${output.matchedCount} 个，歧义 ${output.ambiguousCount} 个，未命中 ${output.notFoundCount} 个。`,
  }),
  toModelObservation: (output) => ({
    status: output.status,
    factLevel: "resolved_candidates",
    fulfillment: {
      satisfied: true,
    },
    mentionCount: output.mentionCount,
    matchedCount: output.matchedCount,
    ambiguousCount: output.ambiguousCount,
    notFoundCount: output.notFoundCount,
    requiredExerciseIdsBoundary: "matched 或模型从 ambiguous 候选中选择的 exerciseId 可作为后续 requiredExerciseIds 正向锚点。",
    outputBoundary: "本 observation 不能直接作为 visibleTrainingProposal.exerciseItems[*].exerciseId 的动作事实来源；最终动作事实仍需来自 section-scoped 动作查询结果或已导入的训练业务事实。",
    results: output.results.map((result) => ({
      text: result.text,
      ...(result.sectionHint ? { sectionHint: result.sectionHint } : {}),
      status: result.status,
      totalMatches: result.totalMatches,
      returnedCount: result.returnedCount,
      truncated: result.truncated,
      matches: result.matches.map((match) => ({
        exerciseId: match.exerciseId,
        nameZh: match.nameZh,
        nameEn: match.nameEn,
        equipmentZh: match.equipmentZh,
        homeRequirementZh: match.homeRequirementZh,
        primaryMusclesZh: match.primaryMusclesZh,
        allowedSections: match.allowedSections,
        imageUrl: match.imageUrl,
      })),
      diagnostics: result.diagnostics.map(toJsonMentionDiagnostic),
    })),
  }),
  toUserProjection: (output) => ({
    status: output.status,
    mentionCount: output.mentionCount,
    matchedCount: output.matchedCount,
    ambiguousCount: output.ambiguousCount,
    notFoundCount: output.notFoundCount,
    results: output.results.map((result) => ({
      text: result.text,
      ...(result.sectionHint ? { sectionHint: result.sectionHint } : {}),
      status: result.status,
      matches: result.matches.map((match) => ({
        exerciseId: match.exerciseId,
        nameZh: match.nameZh,
        nameEn: match.nameEn,
        equipmentZh: match.equipmentZh,
        homeRequirementZh: match.homeRequirementZh,
        primaryMusclesZh: match.primaryMusclesZh,
        allowedSections: match.allowedSections,
        imageUrl: match.imageUrl,
      })),
      diagnostics: result.diagnostics.map(toJsonMentionDiagnostic),
    })),
  }),
});

export {
  resolveExerciseResourceMentionsInputSchema,
  resolveExerciseResourceMentionsOutputSchema,
};

function toMentionResolutionOutput(
  mention: MentionInput,
  result: ExerciseResourceMentionResolutionResult,
): MentionResolutionOutput {
  const status = resolveMentionStatus(result);
  const matches = selectMentionMatches(status, result).map(toExerciseMentionSummaryOutput);
  const diagnostics = createMentionDiagnostics(mention, status);

  return {
    text: mention.text,
    sectionHint: mention.sectionHint,
    status,
    totalMatches: result.totalMatches,
    returnedCount: matches.length,
    truncated: result.truncated,
    matches,
    diagnostics,
  };
}

function resolveMentionStatus(result: ExerciseResourceMentionResolutionResult): MentionResolutionOutput["status"] {
  if (result.totalMatches === 0 || result.exercises.length === 0) {
    return "not_found";
  }

  if (result.exactMatchCount === 1 || result.totalMatches === 1) {
    return "matched";
  }

  return "ambiguous";
}

function selectMentionMatches(
  status: MentionResolutionOutput["status"],
  result: ExerciseResourceMentionResolutionResult,
) {
  if (status === "matched") {
    return result.exercises.slice(0, 1);
  }

  return result.exercises;
}

function createMentionDiagnostics(
  mention: MentionInput,
  status: MentionResolutionOutput["status"],
): MentionResolutionOutput["diagnostics"] {
  if (status === "matched") {
    return [];
  }

  if (status === "ambiguous") {
    return [{
      code: "mention_ambiguous",
      message: `点名动作“${mention.text}”匹配到多个发布态动作；模型应选择候选、重新查询或向用户澄清。`,
      text: mention.text,
      sectionHint: mention.sectionHint,
    }];
  }

  return [{
    code: "mention_not_found",
    message: `点名动作“${mention.text}”没有解析到发布态数据库动作；该结果不能作为 visibleTrainingProposal 动作来源。`,
    text: mention.text,
    sectionHint: mention.sectionHint,
  }];
}

function toExerciseMentionSummaryOutput(summary: ExerciseResourceSummary): ExerciseMentionSummaryOutput {
  return {
    exerciseId: summary.id,
    nameEn: summary.nameEn,
    nameZh: summary.nameZh,
    categoryZh: summary.categoryZh,
    levelZh: summary.levelZh,
    equipmentZh: summary.equipmentZh,
    homeRequirementZh: summary.homeRequirementZh,
    primaryMusclesZh: summary.primaryMusclesZh,
    allowedSections: summary.allowedSections,
    imageUrl: summary.imageUrls[0] ?? null,
    reviewStatus: summary.reviewStatus,
    isPublished: true,
  };
}

function toJsonMentionDiagnostic(diagnostic: MentionResolutionOutput["diagnostics"][number]) {
  return {
    code: diagnostic.code,
    message: diagnostic.message,
    text: diagnostic.text,
    ...(diagnostic.sectionHint ? { sectionHint: diagnostic.sectionHint } : {}),
  };
}
