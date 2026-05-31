import { NextResponse } from "next/server";

import {
  authErrorToApiResponse,
  createLocalAnonymousSession,
  getClearLocalAnonymousAuthCookieOptions,
  getLocalAnonymousAuthCookieOptions,
  localAnonymousAuthCookieName,
  LocalAnonymousAuthError,
  readAnonymousTokenFromRequest,
  restoreLocalAnonymousSession,
  softDeleteLocalAnonymousUserForToken,
} from "@/lib/server/auth/local-anonymous-auth";

export async function POST(request: Request) {
  try {
    const token = readAnonymousTokenFromRequest(request);
    const session = token
      ? await restoreLocalAnonymousSession(token)
      : await createLocalAnonymousSession();

    const response = NextResponse.json({
      ok: true,
      expiresAt: session.expiresAt,
      user: session.user,
    });

    response.cookies.set(localAnonymousAuthCookieName, session.token, getLocalAnonymousAuthCookieOptions());

    return response;
  } catch (error) {
    const response = authErrorToApiResponse(error);

    if (error instanceof LocalAnonymousAuthError && error.status === 401) {
      response.cookies.set(localAnonymousAuthCookieName, "", getClearLocalAnonymousAuthCookieOptions());
    }

    return response;
  }
}

export async function DELETE(request: Request) {
  const response = NextResponse.json({ ok: true });
  const token = readAnonymousTokenFromRequest(request);

  if (token) {
    try {
      await softDeleteLocalAnonymousUserForToken(token);
    } catch (error) {
      if (!(error instanceof LocalAnonymousAuthError) || error.status !== 401) {
        throw error;
      }
    }
  }

  response.cookies.set(localAnonymousAuthCookieName, "", getClearLocalAnonymousAuthCookieOptions());

  return response;
}
