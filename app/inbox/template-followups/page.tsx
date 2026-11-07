import { getCurrentProfile } from "@/lib/auth/session";
import { ApprovedTemplateFollowupPanel } from "@/components/inbox/ApprovedTemplateFollowupPanel";

export const dynamic = "force-dynamic";

export default async function TemplateFollowupPage({
  searchParams
}: {
  searchParams?: Promise<{ leadId?: string }>;
}) {
  const auth = await getCurrentProfile();
  if (!auth.authenticated) return null;
  const params = await searchParams;
  return <ApprovedTemplateFollowupPanel leadId={params?.leadId ?? ""} />;
}
