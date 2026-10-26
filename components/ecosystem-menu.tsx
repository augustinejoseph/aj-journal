"use client";
import { AppLauncher } from "@ajoseph/app-launcher";
export function EcosystemMenu() {
  const local = process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_AJ_LOCAL_DEVELOPMENT === "true";
  return <AppLauncher currentApp="journal" registryUrl={local ? process.env.NEXT_PUBLIC_AJ_REGISTRY_URL : undefined} allowLocalhost={local}/>;
}
