import "server-only";

import { getDataMode } from "@/lib/data/data-source";
import { getSupabaseAdminClient } from "@/lib/data/supabase-admin";
import { listLeads } from "@/lib/data/leads-repository";

export type ReplyPerformanceRange = "7d" | "30d" | "90d" | "all";

export type ReplyPerformanceSummary = {
  sampleSize: number;
  responded: number;
  positiveProgression: number;
  filesReceived: number;
  appointmentInterest: number;
  quotationInterest: number;
  frustration: number;
  humanCorrection: number;
  medianResponseMinutes: number | null;
  responseRatePercent: number;
  progressionRatePercent: number;
  frustrationRatePercent: number;
  correctionRatePercent: number;
  byMove: Array<{
    move: string;
    replies: number;
    responded: number;
    progressed: number;
    files: number;
    appointments: number;
    quotations: number;
    frustration: number;
    corrections: number;
    responseRatePercent: number;
    progressionRatePercent: number;
  }>;
  outcomes: Array<{ outcome: string; count: number }>;
};

type QualityRow = {
  lead_id: string | null;
  primary_move: string | null;
  decision: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

function rangeStart(range: ReplyPerformanceRange) {
  if (range === "all") return null;
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  return new Date(Date.now() - days * 86400000).toISOString();
}

function asBoolean(value: unknown) {
  return value === true || value === "true";
}

function asNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function percent(numerator: number, denominator: number) {
  return denominator ? Math.round((numerator / denominator) * 100) : 0;
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round(((sorted[middle - 1] + sorted[middle]) / 2) * 10) / 10;
}

export async function getReplyPerformanceSummary(input: {
  range: ReplyPerformanceRange;
  move?: string;
  includeQa?: boolean;
}): Promise<ReplyPerformanceSummary> {
  const empty: ReplyPerformanceSummary = {
    sampleSize: 0,
    responded: 0,
    positiveProgression: 0,
    filesReceived: 0,
    appointmentInterest: 0,
    quotationInterest: 0,
    frustration: 0,
    humanCorrection: 0,
    medianResponseMinutes: null,
    responseRatePercent: 0,
    progressionRatePercent: 0,
    frustrationRatePercent: 0,
    correctionRatePercent: 0,
    byMove: [],
    outcomes: []
  };
  if (getDataMode() === "Mock Mode") return empty;
  const admin = getSupabaseAdminClient();
  if (!admin) return empty;

  let query = admin
    .from("ai_reply_quality_events")
    .select("lead_id,primary_move,decision,metadata,created_at")
    .eq("shadow_candidate", false)
    .order("created_at", { ascending: false })
    .limit(2000);
  const start = rangeStart(input.range);
  if (start) query = query.gte("created_at", start);
  if (input.move && input.move !== "all") query = query.eq("primary_move", input.move);
  const { data, error } = await query;
  if (error) return empty;

  const leads = await listLeads({ includeInactive: true, includeTest: true, includeNonSales: true });
  const productionLeadIds = new Set(
    leads
      .filter((lead) => input.includeQa || !lead.isTest)
      .map((lead) => lead.id)
  );
  const rows = (data ?? []) as QualityRow[];
  const filtered = rows.filter((row) => row.lead_id && productionLeadIds.has(row.lead_id));
  const grouped = new Map<string, ReplyPerformanceSummary["byMove"][number]>();
  const outcomeCounts = new Map<string, number>();
  const latencies: number[] = [];
  let responded = 0;
  let progressed = 0;
  let files = 0;
  let appointments = 0;
  let quotations = 0;
  let frustration = 0;
  let corrections = 0;

  for (const row of filtered) {
    const metadata = row.metadata ?? {};
    const outcome = String(metadata.clientOutcome ?? metadata.outcome ?? "awaiting_response");
    const responseObserved = Boolean(metadata.outcomeRecordedAt || metadata.clientResponseObservedAt);
    const positive = asBoolean(metadata.positiveProgression);
    const fileReceived = asBoolean(metadata.fileReceived) || outcome === "files_received";
    const appointment = asBoolean(metadata.appointmentInterest) || outcome === "appointment_interest";
    const quotation = asBoolean(metadata.quotationInterest) || outcome === "quotation_interest";
    const frustrated = asBoolean(metadata.frustrationDetected) || outcome === "frustration_or_correction";
    const corrected = ["edited", "rejected"].includes(String(row.decision ?? "")) || asBoolean(metadata.operatorCorrected);
    const latencySeconds = asNumber(metadata.responseLatencySeconds);
    if (latencySeconds !== null && latencySeconds >= 0) latencies.push(latencySeconds / 60);
    if (responseObserved) responded += 1;
    if (positive) progressed += 1;
    if (fileReceived) files += 1;
    if (appointment) appointments += 1;
    if (quotation) quotations += 1;
    if (frustrated) frustration += 1;
    if (corrected) corrections += 1;
    outcomeCounts.set(outcome, (outcomeCounts.get(outcome) ?? 0) + 1);

    const move = String(row.primary_move || "Unclassified");
    const current = grouped.get(move) ?? {
      move,
      replies: 0,
      responded: 0,
      progressed: 0,
      files: 0,
      appointments: 0,
      quotations: 0,
      frustration: 0,
      corrections: 0,
      responseRatePercent: 0,
      progressionRatePercent: 0
    };
    current.replies += 1;
    if (responseObserved) current.responded += 1;
    if (positive) current.progressed += 1;
    if (fileReceived) current.files += 1;
    if (appointment) current.appointments += 1;
    if (quotation) current.quotations += 1;
    if (frustrated) current.frustration += 1;
    if (corrected) current.corrections += 1;
    grouped.set(move, current);
  }

  const byMove = [...grouped.values()]
    .map((item) => ({
      ...item,
      responseRatePercent: percent(item.responded, item.replies),
      progressionRatePercent: percent(item.progressed, item.responded || item.replies)
    }))
    .sort((a, b) => b.replies - a.replies || b.progressionRatePercent - a.progressionRatePercent);

  return {
    sampleSize: filtered.length,
    responded,
    positiveProgression: progressed,
    filesReceived: files,
    appointmentInterest: appointments,
    quotationInterest: quotations,
    frustration,
    humanCorrection: corrections,
    medianResponseMinutes: median(latencies),
    responseRatePercent: percent(responded, filtered.length),
    progressionRatePercent: percent(progressed, responded || filtered.length),
    frustrationRatePercent: percent(frustration, responded || filtered.length),
    correctionRatePercent: percent(corrections, filtered.length),
    byMove,
    outcomes: [...outcomeCounts.entries()].map(([outcome, count]) => ({ outcome, count })).sort((a, b) => b.count - a.count)
  };
}
