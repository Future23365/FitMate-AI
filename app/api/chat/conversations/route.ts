import { NextResponse } from "next/server";

import { listChatConversations, saveChatConversation } from "@/lib/server/chat/chat-history-service";
import { authErrorToApiResponse, requireCurrentUser } from "@/lib/server/auth/local-anonymous-auth";
import { jsonApiError } from "@/lib/server/http/api-error";

export async function GET(request: Request) {
  let currentUser;

  try {
    currentUser = await requireCurrentUser(request);
  } catch (error) {
    return authErrorToApiResponse(error);
  }

  const items = await listChatConversations(currentUser);

  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  let currentUser;

  try {
    currentUser = await requireCurrentUser(request);
  } catch (error) {
    return authErrorToApiResponse(error);
  }

  const body = await request.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return jsonApiError("validation_failed", "Invalid chat conversation payload.", 400);
  }

  const item = await saveChatConversation(body as Parameters<typeof saveChatConversation>[0], currentUser);

  return NextResponse.json({ item });
}
