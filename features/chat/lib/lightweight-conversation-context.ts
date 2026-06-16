import type {
  ConversationSummaryContext,
  FitnessConversationContext,
  FitnessConversationKnownFacts,
} from "@/lib/shared/chat/fitness-conversation-context";
import type { WorkoutPlanIntent } from "@/lib/shared/workout-plans/draft-schema";

type AiContextChatMessage = {
  role: "user" | "assistant";
  content: string;
};

const durableFactPattern =
  /目标|减脂|增肌|塑形|力量|心肺|体能|胸|背|腿|肩|核心|臀|手臂|分钟|min|小时|每周|一周|次|自重|徒手|哑铃|杠铃|壶铃|弹力带|瑜伽垫|健身房|居家|家里|新手|初学|进阶|高级|避免|不要|不想/;

// buildClientFitnessConversationContext 是首页专用轻量上下文构建器，避免首屏加载服务端 Zod schema。
export function buildClientFitnessConversationContext(
  rawMessages: Array<Pick<AiContextChatMessage, "role" | "content">>,
): FitnessConversationContext {
  const messages = normalizeAiContextMessages(rawMessages);
  const arrayFacts = {
    equipment: new Set<string>(),
    injuryLimitations: new Set<string>(),
    preferences: new Set<string>(),
    avoidances: new Set<string>(),
  };
  const knownFacts: Partial<FitnessConversationKnownFacts> = {};

  for (const message of messages) {
    if (message.role === "assistant") {
      continue;
    }

    knownFacts.latestUserMessage = previewText(message.content, 400);
    mergeUserMessageFacts(message.content, knownFacts, arrayFacts);
  }

  const finalKnownFacts: FitnessConversationKnownFacts = {
    equipment: [...arrayFacts.equipment],
    injuryLimitations: [...arrayFacts.injuryLimitations],
    preferences: [...arrayFacts.preferences],
    avoidances: [...arrayFacts.avoidances],
    ...knownFacts,
  };

  return {
    summary: buildContextSummary(finalKnownFacts, undefined),
    knownFacts: finalKnownFacts,
    unresolvedQuestions: [],
  };
}

// buildClientConversationSummaryContext 只约束发送请求所需的 summary 和最新用户消息长度。
export function buildClientConversationSummaryContext(input: {
  summary?: string;
  latestUserMessage: string;
}): ConversationSummaryContext {
  return {
    summary: previewText(input.summary ?? "", 2000),
    latestUserMessage: previewText(input.latestUserMessage, 4000),
  };
}

// initializeClientConversationSummary 为旧历史回读提供轻量迁移，不触发共享 schema 进入首页 bundle。
export function initializeClientConversationSummary(
  rawMessages: Array<Pick<AiContextChatMessage, "role" | "content">>,
  legacyContext?: Pick<FitnessConversationContext, "summary"> | null,
) {
  const latestUserMessage = [...normalizeAiContextMessages(rawMessages)]
    .reverse()
    .find((message) => message.role === "user")?.content ?? "";
  const summary = legacyContext?.summary?.trim() || buildClientFitnessConversationContext(rawMessages).summary;

  return {
    summary,
    latestUserMessage,
  };
}

function normalizeAiContextMessages(messages: unknown[]): AiContextChatMessage[] {
  const normalizedMessages: AiContextChatMessage[] = [];

  for (const message of messages) {
    if (!isRecord(message)) {
      continue;
    }
    if ((message.role === "user" || message.role === "assistant") && typeof message.content === "string") {
      const content = message.content.trim();
      if (content && content.length <= 4000) {
        normalizedMessages.push({ role: message.role, content });
      }
    }
  }

  return normalizedMessages;
}

function mergeUserMessageFacts(
  content: string,
  knownFacts: Partial<FitnessConversationKnownFacts>,
  arrayFacts: {
    equipment: Set<string>;
    injuryLimitations: Set<string>;
    preferences: Set<string>;
    avoidances: Set<string>;
  },
) {
  const minutes = extractSessionMinutes(content);
  const weeklyFrequency = extractWeeklyFrequency(content);
  const calendarHorizonDays = extractCalendarHorizonDays(content);
  const experience = extractExperience(content);
  const goal = extractGoal(content);

  if (minutes) {
    knownFacts.sessionMinutes = minutes;
  }
  if (weeklyFrequency) {
    knownFacts.weeklyFrequency = weeklyFrequency;
  }
  if (calendarHorizonDays) {
    knownFacts.calendarHorizonDays = calendarHorizonDays;
  }
  if (experience) {
    knownFacts.experience = experience;
  }
  if (goal) {
    knownFacts.goal = goal;
  }

  extractEquipment(content).forEach((item) => arrayFacts.equipment.add(item));
  extractPreferences(content).forEach((item) => arrayFacts.preferences.add(item));
  extractAvoidances(content).forEach((item) => arrayFacts.avoidances.add(item));
}

function buildContextSummary(
  knownFacts: FitnessConversationKnownFacts,
  currentIntent: WorkoutPlanIntent | undefined,
) {
  const parts = [
    knownFacts.goal ? `目标：${knownFacts.goal}` : "",
    knownFacts.experience ? `经验：${knownFacts.experience}` : "",
    knownFacts.sessionMinutes ? `单次时长：${knownFacts.sessionMinutes}分钟` : "",
    knownFacts.weeklyFrequency ? `频率：每周${knownFacts.weeklyFrequency}次` : "",
    knownFacts.calendarHorizonDays ? `日历范围：未来${knownFacts.calendarHorizonDays}天` : "",
    knownFacts.equipment.length > 0 ? `器械：${knownFacts.equipment.join("、")}` : "",
    knownFacts.preferences.length > 0 ? `偏好：${knownFacts.preferences.join("、")}` : "",
    knownFacts.avoidances.length > 0 ? `避免：${knownFacts.avoidances.join("、")}` : "",
    currentIntent ? `当前意图：${currentIntent.intentType}` : "",
    knownFacts.latestUserMessage ? `最近用户输入：${knownFacts.latestUserMessage}` : "",
  ].filter(Boolean);

  return parts.join("；").slice(0, 2000);
}

function extractSessionMinutes(content: string) {
  const match = content.match(/(\d{1,3})\s*(?:分钟|min)/i);
  const minutes = match ? Number(match[1]) : undefined;

  return minutes && minutes >= 1 && minutes <= 240 ? minutes : undefined;
}

function extractWeeklyFrequency(content: string) {
  const match =
    content.match(/(?:每周|一周)\s*([一二两三四五六七\d])\s*(?:次|练|天)/) ??
    content.match(/([一二两三四五六七\d])\s*(?:次|练|天)(?:\/周|每周|一周)/);
  const frequency = match ? parseSmallChineseNumber(match[1]) : undefined;

  return frequency && frequency >= 1 && frequency <= 7 ? frequency : undefined;
}

function parseSmallChineseNumber(value: string) {
  if (/^\d+$/.test(value)) {
    return Number(value);
  }

  const map: Record<string, number> = {
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
  };

  return map[value];
}

function extractCalendarHorizonDays(content: string) {
  const match = content.match(/未来\s*(\d{1,2})\s*天/);
  const days = match ? Number(match[1]) : undefined;

  return days && days >= 1 && days <= 90 ? days : undefined;
}

function extractExperience(content: string): FitnessConversationKnownFacts["experience"] | undefined {
  if (/新手|初学|刚开始/.test(content)) {
    return "beginner";
  }
  if (/高级|资深|老手/.test(content)) {
    return "advanced";
  }
  if (/进阶|有基础|中级/.test(content)) {
    return "intermediate";
  }

  return undefined;
}

function extractGoal(content: string) {
  const goalKeywords = ["减脂", "增肌", "塑形", "力量", "心肺", "体能", "灵活性", "恢复"];
  const matched = goalKeywords.find((keyword) => content.includes(keyword));

  return matched ? previewText(matched, 120) : undefined;
}

function extractEquipment(content: string) {
  return collectIncludedKeywords(content, ["自重", "徒手", "哑铃", "杠铃", "壶铃", "弹力带", "瑜伽垫", "健身房"]);
}

function extractPreferences(content: string) {
  return durableFactPattern.test(content) ? collectIncludedKeywords(content, ["居家", "家里", "健身房", "低冲击"]) : [];
}

function extractAvoidances(content: string) {
  return collectIncludedKeywords(content, ["跳跃", "跑步", "深蹲", "肩推"]).filter((keyword) =>
    new RegExp(`避免|不要|不想|不能`).test(content) && content.includes(keyword),
  );
}

function collectIncludedKeywords(content: string, keywords: string[]) {
  return keywords.filter((keyword) => content.includes(keyword));
}

function previewText(value: string, maxLength: number) {
  return value.trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
