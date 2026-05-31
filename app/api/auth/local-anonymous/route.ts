import { NextResponse } from "next/server";

import {
  authErrorToApiResponse,
  createLocalAnonymousSession,
  readAnonymousTokenFromRequest,
  restoreLocalAnonymousSession,
} from "@/lib/server/auth/local-anonymous-auth";

export async function POST(request: Request) {
  try {
    const token = readAnonymousTokenFromRequest(request);
    const session = token
      ? await restoreLocalAnonymousSession(token)
      : await createLocalAnonymousSession();

    return NextResponse.json({
      ok: true,
      token: session.token,
      expiresAt: session.expiresAt,
      user: session.user,
    });
  } catch (error) {
    return authErrorToApiResponse(error);
  }
}
