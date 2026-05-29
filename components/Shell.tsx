import { ShellChrome } from "@/components/ShellChrome";
import { getCurrentProfile } from "@/lib/auth/session";

export async function Shell({ children }: { children: React.ReactNode }) {
  const auth = await getCurrentProfile();
  return <ShellChrome auth={auth}>{children}</ShellChrome>;
}
