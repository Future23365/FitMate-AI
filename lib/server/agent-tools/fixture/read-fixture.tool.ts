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
  description: "Read a deterministic fixture document for M0 agent-core contract tests.",
  whenToUse: "Use only in M0 contract tests when a read-only tool call needs deterministic output.",
  whenNotToUse: "Do not use for production chat, exercise search, workout generation, persistence, or user memory.",
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
      description: "Read a sample alpha fixture.",
      input: {
        fixtureId: "alpha-intro",
        tags: ["alpha"],
      },
    },
  ],
  handler: (input: z.infer<typeof readFixtureInputSchema>) => ({
    fixtureId: input.fixtureId,
    title: `Fixture ${input.fixtureId}`,
    body: `This is deterministic fixture content for ${input.fixtureId}.`,
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

