import "server-only";

export const CLIENT_FILE_DAILY_MANIFEST_RETENTION = 35;
export const CLIENT_FILE_MONTHLY_MANIFEST_RETENTION = 12;

export type RecoveryRunType = "integrity" | "backup" | "restore_drill";
export type RecoveryRunStatus = "running" | "succeeded" | "partial" | "failed" | "not_configured";

export type ClientFileRecoveryRunResult = {
  runId: string;
  runType: RecoveryRunType;
  status: RecoveryRunStatus;
  sourceObjectCount: number;
  processedObjectCount: number;
  verifiedObjectCount: number;
  copiedObjectCount: number;
  failedObjectCount: number;
  sourceBytes: number;
  copiedBytes: number;
  manifestKey: string;
  manifestSha256: string;
  errorCode: string;
};

function destinationLabel() {
  try {
    const host = new URL(process.env.DR_S3_ENDPOINT || "").hostname;
    return host ? `s3:${host}` : "s3-compatible";
  } catch {
    return "s3-compatible";
  }
}

export function getClientFileRecoveryRuntime() {
  const required = [
    "DR_S3_ENDPOINT",
    "DR_S3_REGION",
    "DR_S3_BUCKET",
    "DR_S3_ACCESS_KEY_ID",
    "DR_S3_SECRET_ACCESS_KEY"
  ];
  const missing = required.filter((name) => !process.env[name]);
  return {
    configured: missing.length === 0,
    missing,
    destination: destinationLabel(),
    bucketConfigured: Boolean(process.env.DR_S3_BUCKET),
    restoreBucketIsolated: Boolean(
      process.env.DR_S3_RESTORE_BUCKET &&
      process.env.DR_S3_RESTORE_BUCKET !== process.env.DR_S3_BUCKET
    ),
    dailyManifestRetention: CLIENT_FILE_DAILY_MANIFEST_RETENTION,
    monthlyManifestRetention: CLIENT_FILE_MONTHLY_MANIFEST_RETENTION
  };
}
