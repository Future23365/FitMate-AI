import {
  VisibleOutputRendererRegistry,
  type VisibleOutputRenderer,
} from "@/lib/server/agent-core/visible-output-renderer";

import { visibleTrainingProposalOutputType } from "./visible-training-proposal-contract";
import { renderVisibleTrainingProposalOutput } from "./visible-training-proposal-renderer";

/** createLegacyVisibleTrainingProposalRenderer 仅为旧 agent-core response renderer 复用共享 renderer 逻辑。 */
export function createLegacyVisibleTrainingProposalRenderer(): VisibleOutputRenderer {
  return {
    outputType: visibleTrainingProposalOutputType,
    render: (output, context) => renderVisibleTrainingProposalOutput(output, context.result, context.outputIndex),
  };
}

/** createProductionVisibleOutputRendererRegistry 保留旧聊天服务的 renderer registry 类型，生产新链路不再依赖它。 */
export function createProductionVisibleOutputRendererRegistry() {
  const registry = new VisibleOutputRendererRegistry();
  registry.register(createLegacyVisibleTrainingProposalRenderer());
  return registry;
}
