import { ActionButton } from "@/components/ActionButton";
import { PageHeader } from "@/components/PageHeader";

const fileRequests = [
  { client: "Daniel Tan", floorPlan: "Missing", sitePhotos: "Missing", uploadLink: "Placeholder only", folder: "Mock folder" },
  { client: "Apex Clinic", floorPlan: "Missing", sitePhotos: "Received", uploadLink: "Placeholder only", folder: "Mock folder" }
];

export default function ClientFilesPage() {
  return (
    <>
      <PageHeader title="Client Files" eyebrow="Upload link placeholder" />
      <div className="grid gap-4 lg:grid-cols-2">
        {fileRequests.map((item) => (
          <article key={item.client} className="rounded border border-command-line bg-command-panel p-5 shadow-command">
            <h3 className="text-lg font-semibold">{item.client}</h3>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="text-command-muted">Floor plan</dt><dd>{item.floorPlan}</dd></div>
              <div><dt className="text-command-muted">Site photos</dt><dd>{item.sitePhotos}</dd></div>
              <div><dt className="text-command-muted">Upload link status</dt><dd>{item.uploadLink}</dd></div>
              <div><dt className="text-command-muted">Client folder status</dt><dd>{item.folder}</dd></div>
            </dl>
            <p className="mt-4 rounded border border-command-line bg-command-panel2 p-3 text-sm text-command-muted">No real upload, no Supabase storage action, and no real client files are exposed in this launch candidate.</p>
            <div className="mt-4">
              <ActionButton tone="muted" disabled>Create Upload Link Later</ActionButton>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
