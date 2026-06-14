import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  defaultExerciseExecutionTaxonomy,
  exerciseExecutionTaxonomySchema,
  exerciseImpactLevelValues,
  exerciseKnownSetupComplexityValues,
  exerciseNoiseLevelValues,
  exerciseRequiredEquipmentTagValues,
  exerciseSetupComplexityRank,
  exerciseSetupComplexityValues,
  exerciseSupportRequirementTagValues,
  isExerciseSetupComplexityAtMost,
} from "@/lib/shared/exercises/execution-taxonomy";

const projectRoot = process.cwd();
const migrationPath = join(
  projectRoot,
  "prisma/migrations/20260614161141_add_exercise_execution_taxonomy/migration.sql",
);

describe("exercise execution taxonomy", () => {
  it("keeps controlled values centralized with stable setup complexity ordering", () => {
    expect(exerciseRequiredEquipmentTagValues).toEqual([
      "dumbbell",
      "barbell",
      "resistance_band",
      "machine",
      "cable",
      "kettlebell",
      "medicine_ball",
      "foam_roller",
      "ez_bar",
      "stability_ball",
      "other_equipment",
    ]);
    expect(exerciseSupportRequirementTagValues).toEqual([
      "none",
      "floor_or_mat",
      "chair_or_wall",
      "gym_fixture",
      "partner",
      "outdoor_space",
    ]);
    expect(exerciseSetupComplexityValues).toEqual([
      "zero_setup",
      "floor_or_mat",
      "home_support",
      "small_equipment",
      "gym_fixture",
      "partner",
      "outdoor",
      "unknown",
    ]);
    expect(exerciseImpactLevelValues).toEqual(["low", "medium", "high"]);
    expect(exerciseNoiseLevelValues).toEqual(["quiet", "normal", "loud"]);
    expect(exerciseKnownSetupComplexityValues.map((value) => exerciseSetupComplexityRank[value])).toEqual([
      0,
      1,
      2,
      3,
      4,
      5,
      6,
    ]);
  });

  it("parses unknown-safe defaults without pretending data is no-equipment or low-friction", () => {
    expect(exerciseExecutionTaxonomySchema.parse({})).toEqual(defaultExerciseExecutionTaxonomy);
    expect(defaultExerciseExecutionTaxonomy).toEqual({
      requiresExternalEquipment: null,
      requiredEquipmentTags: [],
      supportRequirementTags: [],
      setupComplexity: "unknown",
      impactLevel: null,
      noiseLevel: null,
    });
    expect(isExerciseSetupComplexityAtMost("unknown", "zero_setup")).toBe(false);
    expect(isExerciseSetupComplexityAtMost("unknown", "outdoor")).toBe(false);
  });

  it("enforces equipment and support tag invariants", () => {
    expect(
      exerciseExecutionTaxonomySchema.safeParse({
        requiresExternalEquipment: false,
        requiredEquipmentTags: [],
        supportRequirementTags: ["floor_or_mat"],
        setupComplexity: "floor_or_mat",
        impactLevel: "low",
        noiseLevel: "quiet",
      }).success,
    ).toBe(true);
    expect(
      exerciseExecutionTaxonomySchema.safeParse({
        requiresExternalEquipment: true,
        requiredEquipmentTags: ["dumbbell"],
        supportRequirementTags: [],
        setupComplexity: "small_equipment",
        impactLevel: "medium",
        noiseLevel: "normal",
      }).success,
    ).toBe(true);
    expect(
      exerciseExecutionTaxonomySchema.safeParse({
        requiresExternalEquipment: false,
        requiredEquipmentTags: ["dumbbell"],
      }).success,
    ).toBe(false);
    expect(
      exerciseExecutionTaxonomySchema.safeParse({
        requiresExternalEquipment: true,
        requiredEquipmentTags: [],
      }).success,
    ).toBe(false);
    expect(
      exerciseExecutionTaxonomySchema.safeParse({
        requiresExternalEquipment: null,
        requiredEquipmentTags: ["other_equipment"],
      }).success,
    ).toBe(false);
    expect(
      exerciseExecutionTaxonomySchema.safeParse({
        supportRequirementTags: ["none", "floor_or_mat"],
      }).success,
    ).toBe(false);
  });

  it("keeps migration defaults nullable or unknown-safe for existing Exercise rows", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain('ADD COLUMN "requiresExternalEquipment" BOOLEAN');
    expect(migration).not.toContain('"requiresExternalEquipment" BOOLEAN NOT NULL');
    expect(migration).not.toContain('"requiresExternalEquipment" BOOLEAN DEFAULT false');
    expect(migration).toContain('ADD COLUMN "requiredEquipmentTags" TEXT[] DEFAULT ARRAY[]::TEXT[]');
    expect(migration).toContain('ADD COLUMN "supportRequirementTags" TEXT[] DEFAULT ARRAY[]::TEXT[]');
    expect(migration).toContain('ADD COLUMN "setupComplexity" TEXT NOT NULL DEFAULT \'unknown\'');
    expect(migration).toContain('ADD COLUMN "impactLevel" TEXT');
    expect(migration).toContain('ADD COLUMN "noiseLevel" TEXT');
  });

  it("does not add derived boolean fields to the Prisma Exercise model", () => {
    const schema = readFileSync(join(projectRoot, "prisma/schema.prisma"), "utf8");
    const forbiddenFields = [
      "isNoEquipment",
      "isHomeFriendly",
      "needsMat",
      "requiresPartner",
      "requiresGym",
      "isLowFriction",
    ];

    for (const forbiddenField of forbiddenFields) {
      expect(schema).not.toContain(forbiddenField);
    }
  });

  it("does not make seed infer execution taxonomy from legacy fields", () => {
    const seed = readFileSync(join(projectRoot, "scripts/seed-exercises.mjs"), "utf8");

    expect(seed).not.toContain("requiresExternalEquipment:");
    expect(seed).not.toContain("requiredEquipmentTags:");
    expect(seed).not.toContain("supportRequirementTags:");
    expect(seed).not.toContain("setupComplexity:");
    expect(seed).not.toContain("impactLevel:");
    expect(seed).not.toContain("noiseLevel:");
  });
});
