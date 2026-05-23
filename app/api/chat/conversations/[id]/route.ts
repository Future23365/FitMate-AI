import { NextResponse } from "next/server";

import {
  deleteChatConversation,
  getChatConversationById,
  saveChatConversation,
} from "@/lib/server/chat/chat-history-service";
import { jsonApiError } from "@/lib/server/http/api-error";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const item = await getChatConversationById(decodeURIComponent(id));

  if (!item) {
    return jsonApiError("bad_request", "Chat conversation not found.", 404);
  }

  return NextResponse.json({ item });
}

export async function PUT(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const body = await request.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return jsonApiError("validation_failed", "Invalid chat conversation payload.", 400);
  }

  const item = await saveChatConversation({
    ...(body as Parameters<typeof saveChatConversation>[0]),
    id: decodeURIComponent(id),
  });

  return NextResponse.json({ item });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  await deleteChatConversation(decodeURIComponent(id));

  return new NextResponse(null, { status: 204 });
}
