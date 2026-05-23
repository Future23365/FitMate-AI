import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL ?? "postgresql://fitmate:fitmate@localhost:5432/fitmate?schema=public",
  },
  migrations: {
    seed: "node scripts/seed-exercises.mjs",
  },
});
