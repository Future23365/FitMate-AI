import type {
  AgentRunResult,
  AgentStreamEvent,
  VisibleOutputEnvelope,
} from "./contracts";

export type VisibleOutputRendererContext = {
  result: AgentRunResult;
  outputIndex: number;
};

export type VisibleOutputRenderer = {
  outputType: string;
  render: (
    output: VisibleOutputEnvelope,
    context: VisibleOutputRendererContext,
  ) => AgentStreamEvent[];
};

/** VisibleOutputRendererRegistry 是 Response Renderer 的结构化用户可见输出扩展点，core 不理解业务 payload。 */
export class VisibleOutputRendererRegistry {
  private readonly renderers = new Map<string, VisibleOutputRenderer>();

  register(renderer: VisibleOutputRenderer): VisibleOutputRenderer {
    if (this.renderers.has(renderer.outputType)) {
      throw new Error(`Visible output renderer "${renderer.outputType}" is already registered.`);
    }

    this.renderers.set(renderer.outputType, renderer);
    return renderer;
  }

  render(output: VisibleOutputEnvelope, context: VisibleOutputRendererContext): AgentStreamEvent[] {
    return this.renderers.get(output.outputType)?.render(output, context) ?? [];
  }
}
