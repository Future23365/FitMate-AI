import "server-only";

import {
  JsonValueSchema,
  VisibleOutputEnvelopeSchema,
  type JsonValue,
  type VisibleOutputEnvelope,
  type VisibleOutputValidationContext,
  type VisibleOutputValidationResult,
  type VisibleOutputValidationSummary,
} from "./contracts";

type MaybePromise<T> = T | Promise<T>;

export type VisibleOutputValidationError = {
  code: "terminal_reference_invalid";
  message: string;
  retryable: false;
  details?: JsonValue;
};

export type VisibleOutputValidator = {
  outputType: string;
  schemaVersions: readonly string[];
  validate: (
    output: VisibleOutputEnvelope,
    context: VisibleOutputValidationContext,
  ) => MaybePromise<VisibleOutputValidationResult>;
};

/** VisibleOutputValidatorRegistry 按 outputType 分发结构化输出校验，不理解具体训练业务。 */
export class VisibleOutputValidatorRegistry {
  private readonly validators = new Map<string, VisibleOutputValidator>();

  register(validator: VisibleOutputValidator): VisibleOutputValidator {
    if (this.validators.has(validator.outputType)) {
      throw new Error(`Visible output validator "${validator.outputType}" is already registered.`);
    }

    this.validators.set(validator.outputType, validator);
    return validator;
  }

  validateAll(
    outputs: readonly VisibleOutputEnvelope[],
    context: VisibleOutputValidationContext,
  ): Promise<{ ok: true; summary: VisibleOutputValidationSummary } | { ok: false; error: VisibleOutputValidationError }> {
    return this.validateAllInternal(outputs, context, "async");
  }

  validateAllSync(
    outputs: readonly VisibleOutputEnvelope[],
    context: VisibleOutputValidationContext,
  ): { ok: true; summary: VisibleOutputValidationSummary } | { ok: false; error: VisibleOutputValidationError } {
    return this.validateAllInternal(outputs, context, "sync") as
      | { ok: true; summary: VisibleOutputValidationSummary }
      | { ok: false; error: VisibleOutputValidationError };
  }

  private validateAllInternal(
    outputs: readonly VisibleOutputEnvelope[],
    context: VisibleOutputValidationContext,
    mode: "sync",
  ): { ok: true; summary: VisibleOutputValidationSummary } | { ok: false; error: VisibleOutputValidationError };
  private validateAllInternal(
    outputs: readonly VisibleOutputEnvelope[],
    context: VisibleOutputValidationContext,
    mode: "async",
  ): Promise<{ ok: true; summary: VisibleOutputValidationSummary } | { ok: false; error: VisibleOutputValidationError }>;
  private validateAllInternal(
    outputs: readonly VisibleOutputEnvelope[],
    context: VisibleOutputValidationContext,
    mode: "sync" | "async",
  ):
    | { ok: true; summary: VisibleOutputValidationSummary }
    | { ok: false; error: VisibleOutputValidationError }
    | Promise<{ ok: true; summary: VisibleOutputValidationSummary } | { ok: false; error: VisibleOutputValidationError }> {
    const validate = async () => {
      const summary: VisibleOutputValidationSummary = { outputs: [] };

      for (const [index, output] of outputs.entries()) {
        const base = this.validateStaticEnvelope(output, index);
        if (!base.ok) {
          return base;
        }

        const result = await base.validator.validate(base.output, context);
        const accepted = this.acceptValidationResult(result, base.output, index);
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

    const summary: VisibleOutputValidationSummary = { outputs: [] };
    for (const [index, output] of outputs.entries()) {
      const base = this.validateStaticEnvelope(output, index);
      if (!base.ok) {
        return base;
      }

      const result = base.validator.validate(base.output, context);
      if (isPromiseLike(result)) {
        return {
          ok: false,
          error: createVisibleOutputValidationError(
            "Visible output validator returned async validation in a sync validation path.",
            { index, outputType: base.output.outputType },
          ),
        };
      }

      const accepted = this.acceptValidationResult(result, base.output, index);
      if (!accepted.ok) {
        return accepted;
      }
      summary.outputs.push(accepted.output);
    }

    return { ok: true, summary };
  }

  private validateStaticEnvelope(output: VisibleOutputEnvelope, index: number):
    | { ok: true; output: VisibleOutputEnvelope; validator: VisibleOutputValidator }
    | { ok: false; error: VisibleOutputValidationError } {
    const parsed = VisibleOutputEnvelopeSchema.safeParse(output);
    if (!parsed.success) {
      return {
        ok: false,
        error: createVisibleOutputValidationError(
          "Visible output envelope 不符合 schema。",
          {
            index,
            issues: parsed.error.issues.map((issue) => ({
              path: issue.path.join("."),
              message: issue.message,
            })),
          },
        ),
      };
    }

    const validator = this.validators.get(parsed.data.outputType);
    if (!validator) {
      return {
        ok: false,
        error: createVisibleOutputValidationError(
          `Unknown visible output type "${parsed.data.outputType}".`,
          { index, outputType: parsed.data.outputType },
        ),
      };
    }

    if (!validator.schemaVersions.includes(parsed.data.schemaVersion)) {
      return {
        ok: false,
        error: createVisibleOutputValidationError(
          `Visible output "${parsed.data.outputType}" schemaVersion "${parsed.data.schemaVersion}" is not supported.`,
          {
            index,
            outputType: parsed.data.outputType,
            schemaVersion: parsed.data.schemaVersion,
            supportedSchemaVersions: [...validator.schemaVersions],
          },
        ),
      };
    }

    return { ok: true, output: parsed.data, validator };
  }

  private acceptValidationResult(
    result: VisibleOutputValidationResult,
    output: VisibleOutputEnvelope,
    index: number,
  ):
    | { ok: true; output: VisibleOutputValidationSummary["outputs"][number] }
    | { ok: false; error: VisibleOutputValidationError } {
    if (!result.ok) {
      return {
        ok: false,
        error: createVisibleOutputValidationError(result.message, {
          index,
          outputType: output.outputType,
          schemaVersion: output.schemaVersion,
          ...(result.details === undefined
            ? {}
            : { details: JsonValueSchema.safeParse(result.details).success ? result.details : null }),
        }),
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

function createVisibleOutputValidationError(
  message: string,
  details?: JsonValue,
): VisibleOutputValidationError {
  return {
    code: "terminal_reference_invalid",
    message,
    retryable: false,
    details,
  };
}
