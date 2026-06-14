import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

import exercisesData from "@/data/exercises.zh.json";
import { exerciseExecutionTaxonomySchema } from "@/lib/shared/exercises/execution-taxonomy";

const projectRoot = process.cwd();
const scriptPath = join(projectRoot, "scripts/backfill-exercise-execution-taxonomy.mjs");
const backfillPath = join(projectRoot, "data/exercise-execution-taxonomy.backfill.jsonl");
const backfillModule = await import(pathToFileURL(scriptPath).href);

const generateBackfillRecords = backfillModule.generateBackfillRecords as (exercises: typeof exercisesData) => BackfillRecord[];
const parseBackfillJsonl = backfillModule.parseBackfillJsonl as (content: string) => BackfillRecord[];

type BackfillRecord = {
  exerciseId: string;
  requiresExternalEquipment: boolean | null;
  requiredEquipmentTags: string[];
  supportRequirementTags: string[];
  setupComplexity: string;
  impactLevel: string | null;
  noiseLevel: string | null;
  confidence: "high" | "medium" | "low";
  evidence: string;
  source: string;
};

describe("exercise execution taxonomy backfill", () => {
  it("keeps the committed backfill file generated from the current exercise seed data", () => {
    const generatedRecords = generateBackfillRecords(exercisesData);
    const committedRecords = parseBackfillJsonl(readFileSync(backfillPath, "utf8"));

    expect(committedRecords).toEqual(generatedRecords);
    expect(committedRecords).toHaveLength(exercisesData.length);
    expect(new Set(committedRecords.map((record) => record.exerciseId)).size).toBe(committedRecords.length);

    for (const record of committedRecords) {
      expect(
        exerciseExecutionTaxonomySchema.parse({
          requiresExternalEquipment: record.requiresExternalEquipment,
          requiredEquipmentTags: record.requiredEquipmentTags,
          supportRequirementTags: record.supportRequirementTags,
          setupComplexity: record.setupComplexity,
          impactLevel: record.impactLevel,
          noiseLevel: record.noiseLevel,
        }),
      ).toMatchObject({
        requiresExternalEquipment: record.requiresExternalEquipment,
        setupComplexity: record.setupComplexity,
      });
      expect(record.evidence).toContain("旧字段 equipment=");
    }
  });

  it("classifies high-risk ambiguous legacy fields into stable taxonomy facts", () => {
    const recordsById = new Map(parseBackfillJsonl(readFileSync(backfillPath, "utf8")).map((record) => [record.exerciseId, record]));

    expect(recordsById.get("3_4_Sit-Up")).toMatchObject({
      requiresExternalEquipment: false,
      requiredEquipmentTags: [],
      supportRequirementTags: ["floor_or_mat"],
      setupComplexity: "floor_or_mat",
      impactLevel: "low",
      noiseLevel: "quiet",
    });
    expect(recordsById.get("Body_Tricep_Press")).toMatchObject({
      requiresExternalEquipment: false,
      requiredEquipmentTags: [],
      supportRequirementTags: ["gym_fixture"],
      setupComplexity: "gym_fixture",
    });
    expect(recordsById.get("Close-Grip_Push-Up_off_of_a_Dumbbell")).toMatchObject({
      requiresExternalEquipment: true,
      requiredEquipmentTags: ["dumbbell"],
      supportRequirementTags: ["floor_or_mat"],
      setupComplexity: "small_equipment",
    });
    expect(recordsById.get("Band_Assisted_Pull-Up")).toMatchObject({
      requiresExternalEquipment: true,
      requiredEquipmentTags: ["resistance_band"],
      supportRequirementTags: ["gym_fixture"],
      setupComplexity: "gym_fixture",
    });
    expect(recordsById.get("Trail_Running_Walking")).toMatchObject({
      requiresExternalEquipment: false,
      requiredEquipmentTags: [],
      supportRequirementTags: ["outdoor_space"],
      setupComplexity: "outdoor",
      impactLevel: "high",
      noiseLevel: "loud",
    });
  });

  it("exposes a deterministic npm entry without model configuration", () => {
    const packageJson = JSON.parse(readFileSync(join(projectRoot, "package.json"), "utf8"));
    const script = readFileSync(scriptPath, "utf8");

    expect(packageJson.scripts["db:backfill-execution-taxonomy"]).toBe(
      "node scripts/backfill-exercise-execution-taxonomy.mjs",
    );
    expect(script).not.toContain("DEEPSEEK_API_KEY");
    expect(script).not.toContain("ChatDeepSeek");
  });
});
