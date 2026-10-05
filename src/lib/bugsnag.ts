import Bugsnag from "@bugsnag/js";
import BugsnagPluginReact from "@bugsnag/plugin-react";
import type { Client, OnErrorCallback } from "@bugsnag/core";
import React from "react";

import { APP_NAME } from "@/lib/branding";

const apiKey = import.meta.env.VITE_BUGSNAG_API_KEY?.trim();

function startBugsnag(): Client | undefined {
  if (!apiKey) return undefined;
  if (Bugsnag.isStarted()) return Bugsnag;

  const plugins = import.meta.env.SSR ? [] : [new BugsnagPluginReact(React)];

  return Bugsnag.start({
    apiKey,
    releaseStage: import.meta.env.PROD ? "production" : "development",
    enabledReleaseStages: ["production", "development"],
    metadata: {
      app: { name: APP_NAME },
    },
    plugins,
  });
}

export const bugsnagClient = startBugsnag();

export function notifyBugsnag(error: unknown, onError?: OnErrorCallback): void {
  if (!bugsnagClient) return;
  if (error instanceof Error) {
    bugsnagClient.notify(error, onError);
    return;
  }
  bugsnagClient.notify(new Error(typeof error === "string" ? error : safeStringify(error)), onError);
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

export function getBugsnagErrorBoundary() {
  if (import.meta.env.SSR || !bugsnagClient) return undefined;
  return bugsnagClient.getPlugin("react")?.createErrorBoundary(React);
}
