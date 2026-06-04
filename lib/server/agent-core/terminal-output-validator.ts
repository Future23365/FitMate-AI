import type { ResourceStore } from "./resource-store";
import { AGENT_ERROR_CODES } from "./errors";
import type {
  AgentRunInput,
  FinalAnswerAction,
  JsonValue,
  TerminalOutputValidationSummary,
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
  | { ok: true; metadata?: JsonValue }
  | { ok: false; message: string; details?: JsonValue };

type MaybePromise<T> = T | Promise<T>;

export type TerminalOutputValidator = {
  outputType: string;
  schemaVersions: readonly string[];
  validate: (
    output: VisibleOutputEnvelope,
    context: TerminalOutputValidationContext,
  ) => MaybePromise<TerminalOutputValidationResult>;
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
  ): Promise<{ ok: true; summary: TerminalOutputValidationSummary } | { ok: false; error: ToolError }> {
    return this.validateAllInternal(outputs, context, "async");
  }

  validateAllSync(
    outputs: readonly VisibleOutputEnvelope[],
    context: TerminalOutputValidationContext,
  ): { ok: true; summary: TerminalOutputValidationSummary } | { ok: false; error: ToolError } {
    return this.validateAllInternal(outputs, context, "sync") as
      | { ok: true; summary: TerminalOutputValidationSummary }
      | { ok: false; error: ToolError };
  }

  private validateAllInternal(
    outputs: readonly VisibleOutputEnvelope[],
    context: TerminalOutputValidationContext,
    mode: "sync",
  ): { ok: true; summary: TerminalOutputValidationSummary } | { ok: false; error: ToolError };
  private validateAllInternal(
    outputs: readonly VisibleOutputEnvelope[],
    context: TerminalOutputValidationContext,
    mode: "async",
  ): Promise<{ ok: true; summary: TerminalOutputValidationSummary } | { ok: false; error: ToolError }>;
  private validateAllInternal(
    outputs: readonly VisibleOutputEnvelope[],
    context: TerminalOutputValidationContext,
    mode: "sync" | "async",
  ):
    | { ok: true; summary: TerminalOutputValidationSummary }
    | { ok: false; error: ToolError }
    | Promise<{ ok: true; summary: TerminalOutputValidationSummary } | { ok: false; error: ToolError }> {
    const validate = async () => {
      const summary: TerminalOutputValidationSummary = { outputs: [] };

      for (const [index, output] of outputs.entries()) {
        const base = this.validateStaticEnvelope(output, index);
        if (!base.ok) {
          return base;
        }

        const result = await base.validator.validate(output, context);
        const accepted = this.acceptValidationResult(result, output, index);
        if (!accepted.ok) {
          return accepted;
        }
        summary.outputs.push(accepted.output);
      }

      return { ok: true as const, summary };
    };

    if (mode === "async") {
      return validate();
    }

    const summary: TerminalOutputValidationSummary = { outputs: [] };
    for (const [index, output] of outputs.entries()) {
      const base = this.validateStaticEnvelope(output, index);
      if (!base.ok) {
        return base;
      }

      const result = base.validator.validate(output, context);
      if (isPromiseLike(result)) {
        return {
          ok: false,
          error: createTerminalOutputError(
            "Terminal output validator returned async validation in a sync validation path.",
            { index, outputType: output.outputType },
          ),
        };
      }

      const accepted = this.acceptValidationResult(result, output, index);
      if (!accepted.ok) {
        return accepted;
      }
      summary.outputs.push(accepted.output);
    }

    return { ok: true, summary };
  }

  private validateStaticEnvelope(output: VisibleOutputEnvelope, index: number):
    | { ok: true; validator: TerminalOutputValidator }
    | { ok: false; error: ToolError } {
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

    return { ok: true, validator };
  }

  private acceptValidationResult(
    result: TerminalOutputValidationResult,
    output: VisibleOutputEnvelope,
    index: number,
  ):
    | { ok: true; output: TerminalOutputValidationSummary["outputs"][number] }
    | { ok: false; error: ToolError } {
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

    return {
      ok: true,
      output: {
        index,
        outputType: output.outputType,
        schemaVersion: output.schemaVersion,
        ...(result.metadata !== undefined ? { metadata: result.metadata } : {}),
      },
    };
  }
}

function isPromiseLike<T>(value: MaybePromise<T>): value is Promise<T> {
  return Boolean(
    value
      && typeof value === "object"
      && "then" in value
      && typeof (value as { then?: unknown }).then === "function",
  );
}

function createTerminalOutputError(message: string, details?: JsonValue): ToolError {
  return {
    code: AGENT_ERROR_CODES.TERMINAL_REFERENCE_INVALID,
    message,
    retryable: false,
    details,
  };
}
