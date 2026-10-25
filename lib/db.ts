import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { drizzle as postgresDrizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

let localClient: ReturnType<typeof postgres> | undefined;

export function db() {
  if (!process.env.DATABASE_URL)
    throw new Error("Configure DATABASE_URL first.");
  const hostname = new URL(process.env.DATABASE_URL).hostname;
  if (["localhost", "127.0.0.1", "[::1]"].includes(hostname)) {
    localClient ??= postgres(process.env.DATABASE_URL);
    return postgresDrizzle(localClient);
  }
  return drizzle(neon(process.env.DATABASE_URL));
}
