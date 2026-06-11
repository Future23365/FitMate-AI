import { describe, expect, it } from "vitest";

import { agentRuntimeConfig } from "@/lib/server/config";
import {
  createProductionAgentModelVisibleTextSamples,
  createProductionLangChainToolCatalog,
  lintAgentModelVisibleTextSamples,
  productionLangChainTools,
} from "@/lib/server/langchain-agent";
import type { ExerciseResourceFacetCatalog } from "@/lib/server/exercises/exercise-repository";

describe("production LangChain tool catalog", () => {
  it("builds the static production tool catalog from centralized config", () => {
    const tools = createProductionLangChainToolCatalog();

    expect(tools.map((tool) => tool.name)).toEqual(agentRuntimeConfig.langChain.toolCatalog.allowedToolNames);
    expect(tools.map((tool) => tool.name)).toEqual([
      "reportAgentActivity",
      "inspectVisibleTrainingProposals",
      "resolveExerciseResourceMentions",
      "searchExerciseResources",
      "submitVisibleTrainingProposal",
    ]);
    expect(tools.map((tool) => tool.name)).not.toContain("readFixture");
    expect(tools.map((tool) => tool.timeoutMs)).toEqual([
      undefined,
      agentRuntimeConfig.tools.inspectVisibleTrainingProposals.timeoutMs,
      agentRuntimeConfig.tools.resolveExerciseResourceMentions.timeoutMs,
      agentRuntimeConfig.tools.searchExerciseResources.timeoutMs,
      agentRuntimeConfig.tools.submitVisibleTrainingProposal.timeoutMs,
    ]);
  });

  it("keeps tool descriptions in Chinese without old AgentAction contract terms", () => {
    const descriptions = productionLangChainTools.map((tool) => tool.description).join("\n");
    const findings = lintAgentModelVisibleTextSamples(createProductionAgentModelVisibleTextSamples());

    expect(descriptions).toContain("当前步骤");
    expect(descriptions).toContain("summary");
    expect(descriptions).toContain("不替代业务工具");
    expect(descriptions).toContain("只读");
    expect(descriptions).toContain("服务端");
    expect(descriptions).toContain("动作候选");
    expect(descriptions).toContain("zeroMatchMuscles");
    expect(descriptions).toContain("多 muscles 查询会尽量均衡返回各请求肌群的候选");
    expect(descriptions).toContain("exercise_selection");
    expect(descriptions).toContain("validator");
    expect(descriptions).not.toContain("缺少 warmup 或 stretch");
    expect(descriptions).not.toContain("缺 warmup 或 stretch");
    expect(descriptions).not.toContain("support section");
    expect(descriptions).not.toContain("先查询");
    expect(descriptions).not.toContain("必须调用");
    expect(descriptions).not.toContain("nextActionHints");
    expect(descriptions).not.toContain("continue_tool_call");
    expect(descriptions).not.toContain("AgentAction");
    expect(descriptions).not.toContain("ToolRegistry");
    expect(descriptions).not.toContain("PlannerPort");
    expect(descriptions).not.toContain("final_answer");
    expect(descriptions).not.toContain("ask_user");
    expect(findings).toEqual([]);
  });

  it("injects search facet catalog into the search tool description without changing the whitelist", () => {
    const tools = createProductionLangChainToolCatalog({
      searchExerciseResourcesFacetCatalog: createFacetCatalog(),
    });
    const searchTool = tools.find((tool) => tool.name === "searchExerciseResources");

    expect(tools.map((tool) => tool.name)).toEqual(agentRuntimeConfig.langChain.toolCatalog.allowedToolNames);
    expect(searchTool?.description).toContain("当前动作库 facet catalog 摘要");
    expect(searchTool?.description).toContain("胸部");
    expect(searchTool?.description).toContain("no_equipment");
  });

  it("does not expose published as searchExerciseResources model input", () => {
    const tools = createProductionLangChainToolCatalog({
      searchExerciseResourcesFacetCatalog: createFacetCatalog(),
    });
    const searchTool = tools.find((tool) => tool.name === "searchExerciseResources");

    expect(searchTool?.description).not.toContain("published");
    expect(searchTool?.inputSchema.safeParse({
      muscles: ["胸部"],
      published: true,
      sort: "name_asc",
    }).success).toBe(false);
  });
});

function createFacetCatalog(): ExerciseResourceFacetCatalog {
  return {
    muscles: ["胸部", "肱三头肌"],
    categories: ["力量"],
    levels: ["beginner"],
    forces: ["push"],
    mechanics: ["compound"],
    equipment: ["自重"],
    homeRequirements: ["none", "地面"],
    goalTags: ["strength"],
    riskTags: [],
    suitabilities: ["training", "warmup", "stretch"],
  };
}
