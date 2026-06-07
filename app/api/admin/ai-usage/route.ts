import { NextResponse } from "next/server";

import { adminAuthErrorToApiResponse, requireAdminUser } from "@/lib/server/auth/admin-guard";
import {
  getAdminConversationDetail,
  getAdminUsageOverview,
  getAdminUserDetail,
  listAdminUsers,
} from "@/lib/server/admin/admin-ai-usage-service";
import { jsonApiError } from "@/lib/server/http/api-error";

export async function GET(request: Request) {
  try {
    await requireAdminUser(request);
  } catch (error) {
    return adminAuthErrorToApiResponse(error);
  }

  const url = new URL(request.url);
  const limit = readLimit(url.searchParams.get("limit"));
  const userId = url.searchParams.get("userId")?.trim();
  const conversationId = url.searchParams.get("conversationId")?.trim();

  if (conversationId) {
    const conversation = await getAdminConversationDetail(conversationId);

    if (!conversation) {
      return jsonApiError("bad_request", "Admin conversation detail not found.", 404);
    }

    return NextResponse.json({ view: "conversation", conversation });
  }

  if (userId) {
    const user = await getAdminUserDetail(userId, { limit });

    if (!user) {
      return jsonApiError("bad_request", "Admin user detail not found.", 404);
    }

    return NextResponse.json({ view: "user", user });
  }

  const [overview, users] = await Promise.all([
    getAdminUsageOverview(),
    listAdminUsers({ limit }),
  ]);

  return NextResponse.json({ view: "overview", overview, users });
}

function readLimit(value: string | null) {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}
