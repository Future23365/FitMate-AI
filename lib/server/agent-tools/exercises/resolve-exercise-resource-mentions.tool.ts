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
  version: "0.1.0",
  description: "把模型结构化传入的用户点名动作文本解析为发布态 Exercise 摘要，返回 matched、ambiguous 或 not_found；不读取完整聊天文本做服务端拆词。",
  whenToUse: [
    "当用户明确点名一个或多个动作，例如“包含俯卧撑、深蹲和平板支撑”，并且 Planner 需要确认这些动作是否存在于发布态动作库时使用。",
    "多点名训练请求应先调用本 tool，把每个点名动作解析为数据库 exerciseId；随后把 matched 或模型已选择的 exerciseId 传给 searchExerciseResources.requiredExerciseIds，让现有 groups.<section>.exercises 列表优先包含这些动作。",
    "本 tool 只解析 Exercise resource 身份和有限摘要；歧义结果应由模型继续选择、重查或澄清，不由服务端替模型判断用户语义。",
    "结果可以帮助构造下一轮 searchExerciseResources input；最终训练方案仍必须基于动作查询返回的 section-scoped 动作事实，并写入 final_answer.visibleOutputs[]。",
  ].join(" "),
  whenNotToUse: [
    "不要用本 tool 生成 visibleTrainingProposal、routine、plan、patch、prescription、schedule、训练卡片、保存 artifact、用户记忆或执行候选集合。",
    "不要把完整用户消息、conversationSummary、历史自然语言、分页、userId、sql、candidateUse、resultRequirements 或训练生成参数传给本 tool。",
    "不要把 not_found 或 ambiguous 结果当作可直接写入 visibleTrainingProposal 的动作来源；需要澄清、选择候选或重新查询。",
    "不要用服务端关键词、正则、同义词表或短句模板从用户原文拆 mention；mentions 必须由 Planner 结构化传入。",
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
      input: {
        mentions: [
          { text: "俯卧撑", sectionHint: "training" },
          { text: "深蹲", sectionHint: "training" },
          { text: "平板支撑", sectionHint: "training" },
        ],
      },
    },
    {
      description: "解析单个可能歧义的动作名；如果返回 ambiguous，模型应选择候选、重查或向用户澄清。",
      input: {
        mentions: [
          { text: "划船", sectionHint: "training" },
        ],
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
    mentionCount: output.mentionCount,
    matchedCount: output.matchedCount,
    ambiguousCount: output.ambiguousCount,
    notFoundCount: output.notFoundCount,
    nextStepHint: "将 matched 或模型已从 ambiguous 中选择的 exerciseId 传给 searchExerciseResources.requiredExerciseIds；不要把本 observation 直接当作 visibleTrainingProposal。",
    finalAnswerGrounding: "本 tool 只确认点名动作身份；最终训练方案仍应基于 searchExerciseResources 返回的 groups.<section>.exercises 和 ok=true tool result。",
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
