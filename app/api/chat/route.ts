import { startAiTrace, summarizeLatestUserMessage } from "@/lib/server/dev/ai-trace-logger";
import {
  aiRunTraceModel,
  aiRunTracePromptVersion,
  aiRunTraceToolVersions,
  summarizeRecentArtifactsForTrace,
} from "@/lib/server/dev/ai-run-trace";
import { authErrorToApiResponse, requireCurrentUser } from "@/lib/server/auth/local-anonymous-auth";
import { jsonApiError } from "@/lib/server/http/api-error";
import {
  chatRequestSchema,
  createAiChatResponse,
  prepareAiChatRequest,
} from "@/lib/server/chat/chat-service";
import { getChatConversationById } from "@/lib/server/chat/chat-history-service";
import { listRecentArtifactSummariesForCurrentUser } from "@/lib/server/conversation-artifacts/artifact-service";

export async function POST(request: Request) {
  let user;

  try {
    user = await requireCurrentUser(request);
  } catch (error) {
    return authErrorToApiResponse(error);
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (!apiKey) {
    return jsonApiError(
      "missing_configuration",
      "Missing DEEPSEEK_API_KEY environment variable.",
      500,
    );
  }

  const body = await request.json().catch(() => null);
  const parsedRequest = chatRequestSchema.safeParse(body);

  if (!parsedRequest.success) {
    return jsonApiError(
      "validation_failed",
      "Invalid chat request body.",
      400,
      parsedRequest.error.flatten(),
    );
  }

  const [savedConversation, recentArtifactSummaries] = await Promise.all([
    parsedRequest.data.conversationId
      ? getChatConversationById(parsedRequest.data.conversationId, user)
      : Promise.resolve(null),
    listRecentArtifactSummariesForCurrentUser(parsedRequest.data.conversationId, undefined, user),
  ]);
  const preparedRequest = prepareAiChatRequest(parsedRequest.data, {
    savedConversation,
    recentArtifactSummaries,
  });

  if (preparedRequest.rawMessages.length === 0) {
    return jsonApiError("validation_failed", "At least one valid message is required.", 400);
  }

  const trace = startAiTrace({
    route: "/api/chat",
    title: summarizeLatestUserMessage(preparedRequest.rawMessages),
    userId: user.id,
    sessionId: preparedRequest.conversationId,
    messageId: preparedRequest.responseMessageId,
    model: aiRunTraceModel,
    promptVersion: aiRunTracePromptVersion,
    toolVersions: aiRunTraceToolVersions,
    input: {
      latestUserMessage: parsedRequest.data.latestUserMessage,
      recentArtifactSummaries: summarizeRecentArtifactsForTrace(preparedRequest.recentArtifactSummaries),
    },
    metadata: {
      messageCount: preparedRequest.rawMessages.length,
      aiContextMessageCount: preparedRequest.messages.length,
      recentArtifactCount: preparedRequest.recentArtifactSummaries.length,
      hydrationSource: preparedRequest.hydration.source,
      savedConversationFound: preparedRequest.hydration.savedConversationFound,
      restoredMessageCount: preparedRequest.hydration.restoredMessageCount,
      hasSavedConversationContext: preparedRequest.hydration.hasSavedConversationContext,
      recommendationIntentCount: preparedRequest.hydration.recommendationIntentCount,
      hasClientConversationSummary: preparedRequest.hasClientConversationSummary,
      thinkingEnabled: preparedRequest.thinkingEnabled,
    },
  });

  return createAiChatResponse({
    apiKey,
    request: preparedRequest,
    trace,
    currentUser: user,
  });
}
