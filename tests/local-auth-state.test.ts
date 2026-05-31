import { describe, expect, it } from "vitest";

import {
  initialLocalAuthRuntimeState,
  localAuthRequiredState,
  localAuthResetState,
  localAuthSucceededState,
} from "@/lib/client/auth/local-auth-state";

describe("local auth runtime state", () => {
  it("starts without blocking the current page", () => {
    expect(initialLocalAuthRuntimeState).toMatchObject({
      status: "unauthenticated",
      user: null,
      authDialogOpen: false,
    });
  });

  it("opens the dialog after unauthenticated API responses and closes it after login succeeds", () => {
    const required = localAuthRequiredState(initialLocalAuthRuntimeState, "missing_token");

    expect(required).toMatchObject({
      status: "unauthenticated",
      user: null,
      authDialogOpen: true,
      authRequiredReason: "missing_token",
    });

    expect(localAuthSucceededState(required, { id: "user-1", displayName: "匿名用户" })).toMatchObject({
      status: "authenticated",
      user: { id: "user-1" },
      authDialogOpen: false,
      authRequiredReason: null,
    });
  });

  it("clears runtime user state after reset without opening the dialog immediately", () => {
    expect(localAuthResetState()).toMatchObject({
      status: "unauthenticated",
      user: null,
      authDialogOpen: false,
    });
  });
});
