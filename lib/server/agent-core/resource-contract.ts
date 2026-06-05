import type {
  AgentResourceRef,
  AnyTool,
  RegisterResourceInput,
  ResourceRequirementFailure,
  ToolCallAction,
  ToolError,
  ToolProjectionContext,
  ToolResourceProduction,
  ToolResult,
} from "./contracts";
import { AGENT_ERROR_CODES, AgentContractError } from "./errors";
import { toResourceRef, type ResourceStore } from "./resource-store";

/** ConsumedResourceValidation 是 tool_call 通过执行前资源合同校验后的安全结果。 */
export type ConsumedResourceValidation =
  | { ok: true; consumedResources: AgentResourceRef[] }
  | { ok: false; error: ToolError };

/** validateConsumedResources 在 Executor 前校验 tool_call.consumes 是否满足 tool.resourceContract.requires。 */
export function validateConsumedResources(input: {
  tool: AnyTool;
  action: ToolCallAction;
  resourceStore?: ResourceStore;
}): ConsumedResourceValidation {
  const consumes = input.action.consumes ?? [];
  const requirements = input.tool.resourceContract?.requires ?? [];

  if (consumes.length > 0 && !input.resourceStore) {
    return {
      ok: false,
      error: createContractToolError(
        AGENT_ERROR_CODES.INVALID_RESOURCE_REFERENCE,
        "Resource references require ResourceStore validation.",
      ),
    };
  }

  if (requirements.length === 0 && consumes.length === 0) {
    return { ok: true, consumedResources: [] };
  }

  if (!input.resourceStore) {
    return {
      ok: false,
      error: createContractToolError(
        AGENT_ERROR_CODES.RESOURCE_REQUIREMENT_UNMET,
        "Tool declares resource requirements but no ResourceStore is available.",
      ),
    };
  }

  const unmet: ResourceRequirementFailure[] = [];
  const consumedResources: AgentResourceRef[] = [];
  const matchedConsumeIds = new Set<string>();

  for (const requirement of requirements) {
    if (requirement.required === false) {
      continue;
    }

    const requiredCount = requirement.minCount ?? 1;
    const matchingRefs = consumes.filter((ref) => {
      if (ref.resourceType && ref.resourceType !== requirement.resourceType) {
        return false;
      }

      const resource = input.resourceStore?.get(ref);
      return resource?.resourceType === requirement.resourceType;
    });

    if (matchingRefs.length < requiredCount) {
      unmet.push({
        resourceType: requirement.resourceType,
        role: requirement.role ?? "consumable",
        reason: AGENT_ERROR_CODES.RESOURCE_REQUIREMENT_UNMET,
        message: "Tool call does not provide enough resources for a required resource contract.",
      });
      continue;
    }

    for (const ref of matchingRefs) {
      try {
        const resource = input.resourceStore.assertConsumable(ref, requirement);
        const safeRef = toResourceRef(resource);
        consumedResources.push(safeRef);
        matchedConsumeIds.add(ref.resourceId);
      } catch (error) {
        if (error instanceof AgentContractError) {
          return {
            ok: false,
            error: createContractToolError(error.code, error.message, error.details as ToolError["details"]),
          };
        }
        throw error;
      }
    }
  }

  if (unmet.length > 0) {
    return {
      ok: false,
      error: createContractToolError(
        AGENT_ERROR_CODES.RESOURCE_REQUIREMENT_UNMET,
        "Tool call does not satisfy required resource contracts.",
        { unmet },
      ),
    };
  }

  const unexpectedRefs = consumes.filter((ref) => !matchedConsumeIds.has(ref.resourceId));
  if (unexpectedRefs.length > 0) {
    return {
      ok: false,
      error: createContractToolError(
        AGENT_ERROR_CODES.RESOURCE_CONTRACT_VIOLATION,
        "Tool call consumes resources not declared by the tool resource contract.",
        { unexpectedRefs },
      ),
    };
  }

  return { ok: true, consumedResources };
}

/** ProducedResourceValidation 是执行后资源产出合同校验和登记的安全结果。 */
export type ProducedResourceValidation =
  | { ok: true; producedResources: AgentResourceRef[] }
  | { ok: false; error: ToolError };

/** validateAndRegisterProducedResources 校验 produces 合同后才把 handler 声明的资源登记进当前 run。 */
export function validateAndRegisterProducedResources(input: {
  tool: AnyTool;
  result: Extract<ToolResult, { ok: true }>;
  resourceStore: ResourceStore;
  projectionContext: ToolProjectionContext;
}): ProducedResourceValidation {
  const declaredResources = input.tool.toResources?.(input.result.output, input.projectionContext) ?? [];
  const productions = input.tool.resourceContract?.produces ?? [];

  if (declaredResources.length === 0 && productions.length === 0) {
    return { ok: true, producedResources: [] };
  }

  // 对声明 produces 但返回诊断结果的 tool，允许不登记 resource；普通 final_answer grounding 不依赖 satisfied。
  if (declaredResources.length === 0 && productions.length > 0 && input.result.fulfillment.satisfied) {
    return {
      ok: false,
      error: createContractToolError(
        AGENT_ERROR_CODES.RESOURCE_CONTRACT_VIOLATION,
        "Tool declares produced resources in its contract but did not return any resources.",
      ),
    };
  }

  const invalidResource = declaredResources.find((resource) => !matchesAnyProduction(resource, productions));
  if (invalidResource) {
    return {
      ok: false,
      error: createContractToolError(
        AGENT_ERROR_CODES.RESOURCE_CONTRACT_VIOLATION,
        "Produced resource does not match the tool resource contract.",
        {
          resourceId: invalidResource.resourceId ?? "[generated-by-resource-store]",
          resourceType: invalidResource.resourceType,
          role: invalidResource.role,
        },
      ),
    };
  }

  const producedResources = declaredResources.map((resource, index) => {
    const registered = input.resourceStore.register({
      ...resource,
      sourceToolResultId: input.result.toolResultId,
      resourceOrdinal: index,
    });
    return toResourceRef(registered);
  });

  return { ok: true, producedResources };
}

function createContractToolError(code: ToolError["code"], message: string, details?: ToolError["details"]): ToolError {
  return {
    code,
    message,
    retryable: false,
    details,
  };
}

function matchesAnyProduction(resource: RegisterResourceInput, productions: ToolResourceProduction[]) {
  return productions.some((production) => {
    if (production.resourceType !== resource.resourceType) {
      return false;
    }
    if (production.role !== resource.role) {
      return false;
    }
    if (production.schemaVersion && production.schemaVersion !== resource.schemaVersion) {
      return false;
    }
    return true;
  });
}
