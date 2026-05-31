import type { LocalAuthRequiredReason } from "@/lib/client/auth/local-auth-events";
import type { LocalAuthUser } from "@/lib/client/auth/local-auth-session";

export type LocalAuthStatus = "authenticated" | "unauthenticated" | "authenticating" | "resetting";

export type LocalAuthRuntimeState = {
  status: LocalAuthStatus;
  user: LocalAuthUser | null;
  authDialogOpen: boolean;
  authRequiredReason: LocalAuthRequiredReason | null;
};

export const initialLocalAuthRuntimeState: LocalAuthRuntimeState = {
  status: "unauthenticated",
  user: null,
  authDialogOpen: false,
  authRequiredReason: null,
};

// 本地 auth 状态模型描述 Dialog 何时出现和关闭，避免 UI 组件内散落条件判断。
export function localAuthRequiredState(
  state: LocalAuthRuntimeState,
  reason: LocalAuthRequiredReason,
): LocalAuthRuntimeState {
  return {
    ...state,
    status: "unauthenticated",
    user: null,
    authDialogOpen: true,
    authRequiredReason: reason,
  };
}

export function localAuthAuthenticatingState(state: LocalAuthRuntimeState): LocalAuthRuntimeState {
  return {
    ...state,
    status: "authenticating",
  };
}

export function localAuthSucceededState(
  state: LocalAuthRuntimeState,
  user: LocalAuthUser,
): LocalAuthRuntimeState {
  return {
    ...state,
    status: "authenticated",
    user,
    authDialogOpen: false,
    authRequiredReason: null,
  };
}

export function localAuthFailedState(state: LocalAuthRuntimeState): LocalAuthRuntimeState {
  return {
    ...state,
    status: "unauthenticated",
    user: null,
    authDialogOpen: true,
  };
}

export function localAuthResettingState(state: LocalAuthRuntimeState): LocalAuthRuntimeState {
  return {
    ...state,
    status: "resetting",
  };
}

export function localAuthResetState(): LocalAuthRuntimeState {
  return initialLocalAuthRuntimeState;
}
