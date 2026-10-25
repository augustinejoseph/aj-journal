import { defineConfig } from "drizzle-kit";
import "./scripts/load-config.mjs";
export default defineConfig({
  schema: "./lib/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
