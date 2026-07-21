"use client";

import { useReportWebVitals } from "next/web-vitals";
import { trackOperatorEvent } from "@/lib/operator-product-analytics";

const trackedMetrics = new Set(["LCP", "INP", "CLS"]);

type OperatorWebVital = {
  metric: string;
  value: number;
  delta: number;
  rating: string;
  route: string;
  device: "mobile" | "tablet" | "desktop";
  navigationType: string;
};

declare global {
  interface Window {
    __limmWebVitals?: OperatorWebVital[];
  }
}

function deviceClass(): OperatorWebVital["device"] {
  if (window.innerWidth <= 480) return "mobile";
  if (window.innerWidth <= 1024) return "tablet";
  return "desktop";
}

function roundMetric(name: string, value: number) {
  return name === "CLS" ? Math.round(value * 10_000) / 10_000 : Math.round(value);
}

function reportOperatorWebVital(metric: Parameters<Parameters<typeof useReportWebVitals>[0]>[0]) {
  if (!trackedMetrics.has(metric.name)) return;
  const measurement: OperatorWebVital = {
    metric: metric.name,
    value: roundMetric(metric.name, metric.value),
    delta: roundMetric(metric.name, metric.delta),
    rating: metric.rating,
    route: window.location.pathname.slice(0, 120) || "/",
    device: deviceClass(),
    navigationType: metric.navigationType
  };

  const history = window.__limmWebVitals ?? [];
  window.__limmWebVitals = [...history.slice(-19), measurement];
  window.dispatchEvent(new CustomEvent("limm:web-vital", { detail: measurement }));

  trackOperatorEvent({
    eventName: "web_vital",
    durationMs: metric.name === "CLS" ? undefined : metric.value,
    metadata: {
      metric: measurement.metric,
      value: measurement.value,
      delta: measurement.delta,
      rating: measurement.rating,
      route: measurement.route,
      device: measurement.device,
      navigationType: measurement.navigationType
    }
  });
}

export function WebVitalsReporter() {
  useReportWebVitals(reportOperatorWebVital);
  return null;
}
