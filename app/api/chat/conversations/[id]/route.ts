import { NextResponse } from "next/server";

import {
  deleteChatConversation,
  getChatConversationById,
  saveChatConversation,
} from "@/lib/server/chat/chat-history-service";
import { authErrorToApiResponse, requireCurrentUser } from "@/lib/server/auth/local-anonymous-auth";
import { jsonApiError } from "@/lib/server/http/api-error";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  let currentUser;

  try {
    currentUser = await requireCurrentUser(request);
  } catch (error) {
    return authErrorToApiResponse(error);
  }

  const { id } = await context.params;
  const item = await getChatConversationById(decodeURIComponent(id), currentUser);

  if (!item) {
    return jsonApiError("bad_request", "Chat conversation not found.", 404);
  }

  return NextResponse.json({ item });
}

export async function PUT(request: Request, context: RouteContext) {
  let currentUser;

  try {
    currentUser = await requireCurrentUser(request);
  } catch (error) {
    return authErrorToApiResponse(error);
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return jsonApiError("validation_failed", "Invalid chat conversation payload.", 400);
  }

  const item = await saveChatConversation({
    ...(body as Parameters<typeof saveChatConversation>[0]),
    id: decodeURIComponent(id),
  }, currentUser);

  return NextResponse.json({ item });
}

export async function DELETE(request: Request, context: RouteContext) {
  let currentUser;

  try {
    currentUser = await requireCurrentUser(request);
  } catch (error) {
    return authErrorToApiResponse(error);
  }

  const { id } = await context.params;
  await deleteChatConversation(decodeURIComponent(id), currentUser);

  return new NextResponse(null, { status: 204 });
}
