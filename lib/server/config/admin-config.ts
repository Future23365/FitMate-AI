import "server-only";

export type AdminConfig = {
  adminUserIds: readonly string[];
  adminEmails: readonly string[];
  adminRoles: readonly string[];
  pagination: {
    defaultLimit: number;
    maxLimit: number;
  };
};

export type AdminIdentityCandidate = {
  id?: string | null;
  email?: string | null;
  role?: string | null;
};

const adminConfigEnvKeys = {
  userIds: "FITMATE_ADMIN_USER_IDS",
} as const;

/** resolveAdminConfig 集中解析后台管理员配置；当前只启用 userId，邮箱和 role 作为未来权限模型边界保留。 */
export function resolveAdminConfig(input: { env?: Partial<NodeJS.ProcessEnv> } = {}): AdminConfig {
  const env = input.env ?? process.env;

  return {
    adminUserIds: parseDelimitedEnvList(env[adminConfigEnvKeys.userIds]),
    adminEmails: [],
    adminRoles: [],
    pagination: {
      defaultLimit: 20,
      maxLimit: 100,
    },
  };
}

/** getAdminConfig 返回当前请求使用的后台权限配置，避免业务模块散落环境变量读取。 */
export function getAdminConfig() {
  return resolveAdminConfig();
}

/** isAdminIdentity 只判断稳定身份字段，不在 UI、Route 或 service 中复制权限规则。 */
export function isAdminIdentity(candidate: AdminIdentityCandidate, config: AdminConfig = getAdminConfig()) {
  if (!isAdminAccessConfigured(config)) {
    return false;
  }

  return Boolean(
    candidate.id && config.adminUserIds.includes(candidate.id)
      || candidate.email && config.adminEmails.includes(candidate.email)
      || candidate.role && config.adminRoles.includes(candidate.role),
  );
}

/** isAdminAccessConfigured 明确表达未配置管理员时默认拒绝访问。 */
export function isAdminAccessConfigured(config: AdminConfig = getAdminConfig()) {
  return config.adminUserIds.length > 0 || config.adminEmails.length > 0 || config.adminRoles.length > 0;
}

function parseDelimitedEnvList(value: string | undefined) {
  if (!value) {
    return [];
  }

  return value
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}
