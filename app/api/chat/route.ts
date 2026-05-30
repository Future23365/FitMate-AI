import { startAiTrace, summarizeLatestUserMessage } from "@/lib/server/dev/ai-trace-logger";
import { jsonApiError } from "@/lib/server/http/api-error";
import {
  chatRequestSchema,
  createAiChatResponse,
  prepareAiChatRequest,
} from "@/lib/server/chat/chat-service";
import { listRecentArtifactSummariesForCurrentUser } from "@/lib/server/conversation-artifacts/artifact-service";

export async function POST(request: Request) {
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

  const preparedRequest = prepareAiChatRequest(parsedRequest.data);
  preparedRequest.recentArtifactSummaries = await listRecentArtifactSummariesForCurrentUser(
    parsedRequest.data.conversationId,
  );

  if (preparedRequest.rawMessages.length === 0) {
    return jsonApiError("validation_failed", "At least one valid message is required.", 400);
  }

  const trace = startAiTrace({
    route: "/api/chat",
    title: summarizeLatestUserMessage(preparedRequest.rawMessages),
    metadata: {
      messageCount: preparedRequest.rawMessages.length,
      aiContextMessageCount: preparedRequest.messages.length,
      recentArtifactCount: preparedRequest.recentArtifactSummaries.length,
      hasClientConversationSummary: preparedRequest.hasClientConversationSummary,
      thinkingEnabled: preparedRequest.thinkingEnabled,
    },
  });

  return createAiChatResponse({
    apiKey,
    request: preparedRequest,
    trace,
  });
}
