import { authErrorToApiResponse, requireCurrentUser } from "@/lib/server/auth/local-anonymous-auth";
import { jsonApiError } from "@/lib/server/http/api-error";
import {
  chatRequestSchema,
  createChatUnavailableResponse,
  prepareChatRequest,
} from "@/lib/server/chat/chat-service";
import { getChatConversationById } from "@/lib/server/chat/chat-history-service";

export async function POST(request: Request) {
  let user;

  try {
    user = await requireCurrentUser(request);
  } catch (error) {
    return authErrorToApiResponse(error);
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

  const savedConversation = parsedRequest.data.conversationId
    ? await getChatConversationById(parsedRequest.data.conversationId, user)
    : null;
  const preparedRequest = prepareChatRequest(parsedRequest.data, {
    savedConversation,
  });

  if (preparedRequest.rawMessages.length === 0) {
    return jsonApiError("validation_failed", "At least one valid message is required.", 400);
  }

  return createChatUnavailableResponse({
    request: preparedRequest,
    currentUser: user,
  });
}
