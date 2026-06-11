import {
  TerminalOutputValidatorRegistry,
  type TerminalOutputValidator,
} from "@/lib/server/agent-core/terminal-output-validator";

import {
  visibleTrainingProposalOutputType,
  visibleTrainingProposalSchemaVersion,
} from "./visible-training-proposal-contract";
import {
  validateVisibleTrainingProposalOutput,
  type VisibleTrainingProposalValidatorOptions,
} from "./visible-training-proposal-validator";

/** createLegacyVisibleTrainingProposalValidator 仅为旧 agent-core 校验入口适配共享 visibleTrainingProposal validator。 */
export function createLegacyVisibleTrainingProposalValidator(
  options: VisibleTrainingProposalValidatorOptions = {},
): TerminalOutputValidator {
  return {
    outputType: visibleTrainingProposalOutputType,
    schemaVersions: [visibleTrainingProposalSchemaVersion],
    validate: (output, context) => validateVisibleTrainingProposalOutput(output, context, options),
  };
}

/** createProductionTerminalOutputValidatorRegistry 保留旧聊天服务的 registry 类型，生产新链路不再依赖它。 */
export function createProductionTerminalOutputValidatorRegistry(
  options: VisibleTrainingProposalValidatorOptions = {},
) {
  const registry = new TerminalOutputValidatorRegistry();
  registry.register(createLegacyVisibleTrainingProposalValidator(options));
  return registry;
}
