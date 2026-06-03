import { createHash } from "node:crypto";

import type {
  AgentResourceRef,
  JsonValue,
  RegisteredResource,
  RegisterResourceInput,
  ResourceRole,
  ResourceStoreReader,
  ToolResourceRequirement,
} from "./contracts";
import { AGENT_ERROR_CODES, AgentContractError } from "./errors";

/** ResourceStore 是当前 run 内资源事实来源，只允许 Runtime 登记、handler 只读消费。 */
export class ResourceStore implements ResourceStoreReader {
  private readonly resources = new Map<string, RegisteredResource>();

  constructor(readonly runId: string) {}

  /** register 在资源进入下游可见 inventory 前绑定 runId、sourceToolResultId 和安全摘要。 */
  register(input: RegisterResourceInput & { sourceToolResultId: string; createdAt?: string; resourceOrdinal?: number }): RegisteredResource {
    assertNonEmpty(input.resourceType, "resourceType");
    assertNonEmpty(input.schemaVersion, "schemaVersion");
    assertNonEmpty(input.sourceToolResultId, "sourceToolResultId");

    const resourceId = input.resourceId ?? createResourceId({
      runId: this.runId,
      sourceToolResultId: input.sourceToolResultId,
      resourceType: input.resourceType,
      role: input.role,
      schemaVersion: input.schemaVersion,
      resourceOrdinal: input.resourceOrdinal ?? 0,
    });
    assertNonEmpty(resourceId, "resourceId");

    if (this.resources.has(resourceId)) {
      throw new AgentContractError(
        AGENT_ERROR_CODES.RESOURCE_CONTRACT_VIOLATION,
        "Resource id is already registered in the current run.",
        { details: { runId: this.runId, resourceId } },
      );
    }

    const resource: RegisteredResource = {
      resourceId,
      resourceType: input.resourceType,
      role: input.role,
      runId: this.runId,
      sourceToolResultId: input.sourceToolResultId,
      schemaVersion: input.schemaVersion,
      summary: input.summary,
      version: input.version,
      createdAt: input.createdAt ?? new Date().toISOString(),
      expiresAt: input.expiresAt,
    };

    this.resources.set(resource.resourceId, resource);
    return resource;
  }

  /** get 按 resource ref 查询当前 run 已登记资源，跨 run ref 不会被当作命中。 */
  get(ref: AgentResourceRef): RegisteredResource | undefined {
    if (ref.runId && ref.runId !== this.runId) {
      return undefined;
    }

    const resource = this.resources.get(ref.resourceId);
    if (!resource) {
      return undefined;
    }

    if (ref.resourceType && ref.resourceType !== resource.resourceType) {
      return undefined;
    }

    if (ref.role && ref.role !== resource.role) {
      return undefined;
    }

    return resource;
  }

  /** list 返回当前 run 的只读资源 inventory，可按 role 或 resourceType 过滤。 */
  list(query: { role?: ResourceRole; resourceType?: string } = {}): RegisteredResource[] {
    return [...this.resources.values()].filter((resource) => {
      if (query.role && resource.role !== query.role) {
        return false;
      }
      if (query.resourceType && resource.resourceType !== query.resourceType) {
        return false;
      }
      return true;
    });
  }

  /** assertConsumable 在下游 tool 执行前证明 ref 属于当前 run、类型匹配且 role 为 consumable。 */
  assertConsumable(ref: AgentResourceRef, requirement?: ToolResourceRequirement): RegisteredResource {
    const resource = this.assertRegistered(ref);
    const requiredType = requirement?.resourceType ?? ref.resourceType;

    if (requiredType && resource.resourceType !== requiredType) {
      throw new AgentContractError(
        AGENT_ERROR_CODES.RESOURCE_TYPE_INVALID,
        "Resource type does not satisfy the tool requirement.",
        { details: { resourceId: ref.resourceId, expected: requiredType, actual: resource.resourceType } },
      );
    }

    if (resource.role !== "consumable") {
      throw new AgentContractError(
        AGENT_ERROR_CODES.RESOURCE_ROLE_INVALID,
        "Only consumable resources can be consumed by downstream tools.",
        { details: { resourceId: ref.resourceId, role: resource.role } },
      );
    }

    return resource;
  }

  /** inventory 暴露可序列化安全摘要，不泄漏完整 output 或 handler 内部对象。 */
  inventory(): Array<{ ref: AgentResourceRef; summary: JsonValue }> {
    return this.list().map((resource) => ({
      ref: toResourceRef(resource),
      summary: resource.summary,
    }));
  }

  /** assertRegistered 用于 terminal grounding 校验当前 run 中存在且字段匹配的资源引用。 */
  assertRegistered(ref: AgentResourceRef): RegisteredResource {
    if (ref.runId && ref.runId !== this.runId) {
      throw new AgentContractError(
        AGENT_ERROR_CODES.RESOURCE_RUN_MISMATCH,
        "Resource reference belongs to another run.",
        { details: { expectedRunId: this.runId, actualRunId: ref.runId, resourceId: ref.resourceId } },
      );
    }

    const resource = this.resources.get(ref.resourceId);
    if (!resource) {
      throw new AgentContractError(
        AGENT_ERROR_CODES.RESOURCE_MISSING,
        "Resource reference is not registered in the current run.",
        { details: { runId: this.runId, resourceId: ref.resourceId } },
      );
    }

    if (ref.resourceType && ref.resourceType !== resource.resourceType) {
      throw new AgentContractError(
        AGENT_ERROR_CODES.RESOURCE_TYPE_INVALID,
        "Resource reference type does not match the registered resource.",
        { details: { resourceId: ref.resourceId, expected: resource.resourceType, actual: ref.resourceType } },
      );
    }

    if (ref.role && ref.role !== resource.role) {
      throw new AgentContractError(
        AGENT_ERROR_CODES.RESOURCE_ROLE_INVALID,
        "Resource reference role does not match the registered resource.",
        { details: { resourceId: ref.resourceId, expected: resource.role, actual: ref.role } },
      );
    }

    return resource;
  }
}

/** toResourceRef 将已登记资源压缩成 Planner/terminal action 可引用的安全 ref。 */
export function toResourceRef(resource: RegisteredResource): AgentResourceRef {
  return {
    resourceId: resource.resourceId,
    resourceType: resource.resourceType,
    role: resource.role,
    runId: resource.runId,
    version: resource.version,
    schemaVersion: resource.schemaVersion,
  };
}

/** createResourceId 由 ResourceStore 基于当前 run 与 toolResult 事实生成受控资源 id。 */
export function createResourceId(input: {
  runId: string;
  sourceToolResultId: string;
  resourceType: string;
  role: ResourceRole;
  schemaVersion: string;
  resourceOrdinal?: number;
}): string {
  const digest = createHash("sha256")
    .update(stableStringify({
      runId: input.runId,
      sourceToolResultId: input.sourceToolResultId,
      resourceType: input.resourceType,
      role: input.role,
      schemaVersion: input.schemaVersion,
      resourceOrdinal: input.resourceOrdinal ?? 0,
    }))
    .digest("hex")
    .slice(0, 16);

  return `res_${digest}`;
}

function assertNonEmpty(value: unknown, field: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new AgentContractError(
      AGENT_ERROR_CODES.RESOURCE_CONTRACT_VIOLATION,
      `Resource ${field} must be a non-empty string.`,
      { details: { field } },
    );
  }
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${stableStringify(child)}`)
    .join(",")}}`;
}
