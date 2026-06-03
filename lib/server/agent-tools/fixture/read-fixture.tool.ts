import { z } from "zod";

import { defineTool } from "@/lib/server/agent-core/define-tool";

const readFixtureInputSchema = z.object({
  fixtureId: z.string().min(1),
  includeMeta: z.boolean().optional(),
  tags: z.array(z.enum(["alpha", "beta", "gamma"])).optional(),
  filters: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
}).strict();

const readFixtureOutputSchema = z.object({
  fixtureId: z.string(),
  title: z.string(),
  body: z.string(),
  meta: z.object({
    tags: z.array(z.string()),
    filters: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  }).optional(),
}).strict();

/** readFixtureTool 是 M0 合同闭环专用只读 fixture，不代表任何真实业务能力。 */
export const readFixtureTool = defineTool({
  name: "readFixture",
  version: "0.1.0",
  description: "读取 M0 agent-core 合同测试使用的确定性 fixture 文档。",
  whenToUse: "仅在 M0 合同测试需要只读 tool call 产生确定性输出时使用。",
  whenNotToUse: "不要用于生产聊天、动作检索、训练生成、持久化或用户记忆。",
  inputSchema: readFixtureInputSchema,
  outputSchema: readFixtureOutputSchema,
  policy: {
    sideEffect: "read",
    riskLevel: "low",
    confirmation: "never",
    timeoutMs: 500,
  },
  examples: [
    {
      description: "读取一个 alpha 示例 fixture。",
      input: {
        fixtureId: "alpha-intro",
        tags: ["alpha"],
      },
    },
  ],
  handler: (input: z.infer<typeof readFixtureInputSchema>) => ({
    fixtureId: input.fixtureId,
    title: `Fixture ${input.fixtureId}`,
    body: `这是 ${input.fixtureId} 的确定性 fixture 内容。`,
    meta: input.includeMeta
      ? {
          tags: input.tags ?? [],
          filters: input.filters,
        }
      : undefined,
  }),
  toModelObservation: (output: z.infer<typeof readFixtureOutputSchema>) => ({
    fixtureId: output.fixtureId,
    title: output.title,
    summary: output.body,
  }),
  toUserProjection: (output: z.infer<typeof readFixtureOutputSchema>) => ({
    title: output.title,
    summary: output.body,
  }),
});
