export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./scripts/load-config.mjs");
  }
}
