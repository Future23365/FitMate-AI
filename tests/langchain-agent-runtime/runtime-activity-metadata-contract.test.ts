import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const runtimeBoundaryFiles = [
  "../../lib/server/langchain-agent/runtime.ts",
  "../../lib/server/langchain-agent/tool-wrapper.ts",
  "../../lib/server/chat/langchain-agent-text-chat-service.ts",
] as const;

const productionContractFiles = [
  "../../lib/server/langchain-agent/prompt.ts",
  "../../lib/server/langchain-agent/tools/production-tool-catalog.ts",
  "../../lib/server/config/agent-runtime-config.ts",
] as const;

const businessToolNames = [
  "searchExerciseResources",
  "inspectVisibleTrainingProposals",
  "submitVisibleTrainingProposal",
] as const;

describe("runtime activity metadata contract", () => {
  it("keeps runtime and stream projection free of business toolName activity branches", () => {
    const boundarySource = runtimeBoundaryFiles.map(readRepoFile).join("\n");
    const forbiddenActivityBranchLines = boundarySource
      .split("\n")
      .filter((line) => businessToolNames.some((toolName) => line.includes(toolName)))
      .filter((line) => (
        line.includes("runtimeActivity")
        || line.includes("activitySummary")
        || line.includes("writeRuntimeActivity")
        || line.includes("agent_progress")
        || line.includes("model_activity")
      ));

    expect(forbiddenActivityBranchLines).toEqual([]);
    expect(boundarySource).not.toContain("用户说");
    expect(boundarySource).not.toContain("关键词");
    expect(boundarySource).not.toContain("短句模板");
    expect(boundarySource).not.toContain("phrasing");
  });

  it("keeps old activity-only production contracts out of prompt, catalog, and config", () => {
    const productionContractSource = productionContractFiles.map(readRepoFile).join("\n");

    expect(productionContractSource).toContain("runtimeMetadata.activitySummary");
    expect(productionContractSource).not.toContain("reportAgentActivity");
    expect(productionContractSource).not.toContain("maxActivityReports");
    expect(productionContractSource).not.toContain("model_activity");
    expect(productionContractSource).not.toContain("activity report");
    expect(productionContractSource).not.toContain("activityReport");
  });
});

function readRepoFile(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}
