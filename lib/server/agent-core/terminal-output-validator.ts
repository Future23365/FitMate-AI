import type { ResourceStore } from "./resource-store";
import { AGENT_ERROR_CODES } from "./errors";
import type {
  AgentRunInput,
  FinalAnswerAction,
  JsonValue,
  ToolError,
  ToolResult,
  VisibleOutputEnvelope,
} from "./contracts";

export type TerminalOutputValidationContext = {
  run?: AgentRunInput;
  action: FinalAnswerAction;
  toolResults: ToolResult[];
  resourceStore?: ResourceStore;
};

export type TerminalOutputValidationResult =
  | { ok: true }
  | { ok: false; message: string; details?: JsonValue };

export type TerminalOutputValidator = {
  outputType: string;
  schemaVersions: readonly string[];
  validate: (
    output: VisibleOutputEnvelope,
    context: TerminalOutputValidationContext,
  ) => TerminalOutputValidationResult;
};

/** TerminalOutputValidatorRegistry 是 final_answer.visibleOutputs[] 的业务校验扩展点，core 只按 outputType 分发。 */
export class TerminalOutputValidatorRegistry {
  private readonly validators = new Map<string, TerminalOutputValidator>();

  register(validator: TerminalOutputValidator): TerminalOutputValidator {
    if (this.validators.has(validator.outputType)) {
      throw new Error(`Terminal output validator "${validator.outputType}" is already registered.`);
    }

    this.validators.set(validator.outputType, validator);
    return validator;
  }

  validateAll(
    outputs: readonly VisibleOutputEnvelope[],
    context: TerminalOutputValidationContext,
  ): { ok: true } | { ok: false; error: ToolError } {
    for (const [index, output] of outputs.entries()) {
      const validator = this.validators.get(output.outputType);

      if (!validator) {
        return {
          ok: false,
          error: createTerminalOutputError(
            `Unknown visible output type "${output.outputType}".`,
            { index, outputType: output.outputType },
          ),
        };
      }

      if (!validator.schemaVersions.includes(output.schemaVersion)) {
        return {
          ok: false,
          error: createTerminalOutputError(
            `Visible output "${output.outputType}" schemaVersion "${output.schemaVersion}" is not supported.`,
            {
              index,
              outputType: output.outputType,
              schemaVersion: output.schemaVersion,
              supportedSchemaVersions: [...validator.schemaVersions],
            },
          ),
        };
      }

      const result = validator.validate(output, context);
      if (!result.ok) {
        const details: Record<string, JsonValue> = {
          index,
          outputType: output.outputType,
          schemaVersion: output.schemaVersion,
        };
        if (result.details !== undefined) {
          details.details = result.details;
        }

        return {
          ok: false,
          error: createTerminalOutputError(result.message, details),
        };
      }
    }

    return { ok: true };
  }
}

function createTerminalOutputError(message: string, details?: JsonValue): ToolError {
  return {
    code: AGENT_ERROR_CODES.TERMINAL_REFERENCE_INVALID,
    message,
    retryable: false,
    details,
  };
}
