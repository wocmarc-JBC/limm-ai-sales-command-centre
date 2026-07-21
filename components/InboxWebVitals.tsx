"use client";

import dynamic from "next/dynamic";

const DeferredWebVitalsReporter = dynamic(
  () => import("@/components/WebVitalsReporter").then((module) => module.WebVitalsReporter),
  { ssr: false }
);

export function InboxWebVitals() {
  return <DeferredWebVitalsReporter />;
}
