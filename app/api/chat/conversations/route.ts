import { NextResponse } from "next/server";

import { listChatConversations, saveChatConversation } from "@/lib/server/chat/chat-history-service";
import { jsonApiError } from "@/lib/server/http/api-error";

export async function GET() {
  const items = await listChatConversations();

  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return jsonApiError("validation_failed", "Invalid chat conversation payload.", 400);
  }

  const item = await saveChatConversation(body as Parameters<typeof saveChatConversation>[0]);

  return NextResponse.json({ item });
}
