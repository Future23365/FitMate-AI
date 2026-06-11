import "server-only";

import type {
  VisibleOutputEnvelope,
  VisibleOutputRendererRunResult,
  VisibleOutputStreamEvent,
} from "./contracts";

export type VisibleOutputRendererContext = {
  result: VisibleOutputRendererRunResult;
  outputIndex: number;
};

export type VisibleOutputRenderer = {
  outputType: string;
  render: (
    output: VisibleOutputEnvelope,
    context: VisibleOutputRendererContext,
  ) => VisibleOutputStreamEvent[];
};

/** VisibleOutputRendererRegistry 将已通过 validator 的结构化输出投影成用户可见 NDJSON 事件。 */
export class VisibleOutputRendererRegistry {
  private readonly renderers = new Map<string, VisibleOutputRenderer>();

  register(renderer: VisibleOutputRenderer): VisibleOutputRenderer {
    if (this.renderers.has(renderer.outputType)) {
      throw new Error(`Visible output renderer "${renderer.outputType}" is already registered.`);
    }

    this.renderers.set(renderer.outputType, renderer);
    return renderer;
  }

  render(output: VisibleOutputEnvelope, context: VisibleOutputRendererContext): VisibleOutputStreamEvent[] {
    return this.renderers.get(output.outputType)?.render(output, context) ?? [];
  }
}
