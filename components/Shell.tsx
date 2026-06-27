import { ShellChrome } from "@/components/ShellChrome";
import { getCurrentProfile } from "@/lib/auth/session";
import { isQaE2EMode, QA_E2E_RUN_ID } from "@/lib/qa-e2e-mode";

export async function Shell({ children }: { children: React.ReactNode }) {
  const auth = await getCurrentProfile();
  return <ShellChrome auth={auth} qaE2eMode={isQaE2EMode()} qaRunId={QA_E2E_RUN_ID}>{children}</ShellChrome>;
}
