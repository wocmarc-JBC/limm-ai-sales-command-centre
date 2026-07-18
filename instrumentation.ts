export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    console.info(JSON.stringify({
      type: "limm_runtime_started",
      release: process.env.npm_package_version || "development",
      commit: process.env.VERCEL_GIT_COMMIT_SHA || "local",
      region: process.env.VERCEL_REGION || "local"
    }));
  }
}
