import "server-only";

import { agentRuntimeConfig } from "@/lib/server/config";
import type { ExerciseResourceFacetCatalog } from "@/lib/server/exercises/exercise-repository";

import type { LangChainToolWrapper } from "../tool-wrapper";
import {
  createSearchExerciseResourcesLangChainTool,
  searchExerciseResourcesLangChainTool,
} from "./exercise-resource-tools";
import { inspectVisibleTrainingProposalsLangChainTool } from "./visible-training-proposal-tools";
import { submitVisibleTrainingProposalLangChainTool } from "./visible-training-proposal-finalization-tool";

export type ProductionLangChainToolName = (typeof agentRuntimeConfig.langChain.toolCatalog.allowedToolNames)[number];

export type CreateProductionLangChainToolCatalogOptions = {
  searchExerciseResourcesFacetCatalog?: ExerciseResourceFacetCatalog;
  enabledToolNames?: readonly ProductionLangChainToolName[];
};

/** createProductionLangChainToolCatalog 从集中配置白名单构造生产 LangChain tool catalog，不按用户原文动态增减。 */
export function createProductionLangChainToolCatalog(
  options: CreateProductionLangChainToolCatalogOptions = {},
): readonly LangChainToolWrapper[] {
  if (!agentRuntimeConfig.langChain.toolCatalog.defaultEnabled) {
    return [];
  }

  const toolsByName = createProductionToolMap(options.searchExerciseResourcesFacetCatalog);
  const enabledToolNames = options.enabledToolNames ?? agentRuntimeConfig.langChain.toolCatalog.allowedToolNames;

  return enabledToolNames.map((name) => {
    const tool = toolsByName.get(name);
    if (!tool) {
      throw new Error(`Unsupported production LangChain tool: ${name}`);
    }
    return tool;
  });
}

/** productionLangChainTools 暴露默认生产 tool 集合，供测试和非 route 注入场景使用。 */
export const productionLangChainTools = [
  inspectVisibleTrainingProposalsLangChainTool,
  searchExerciseResourcesLangChainTool,
  submitVisibleTrainingProposalLangChainTool,
] as const;

function createProductionToolMap(facetCatalog?: ExerciseResourceFacetCatalog) {
  const searchTool = facetCatalog
    ? createSearchExerciseResourcesLangChainTool({ facetCatalog })
    : searchExerciseResourcesLangChainTool;

  return new Map<ProductionLangChainToolName, LangChainToolWrapper>([
    ["inspectVisibleTrainingProposals", inspectVisibleTrainingProposalsLangChainTool],
    ["searchExerciseResources", searchTool],
    ["submitVisibleTrainingProposal", submitVisibleTrainingProposalLangChainTool],
  ]);
}
