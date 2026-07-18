import { notFound } from "next/navigation";
import { uploadClientFileByTokenAction } from "@/lib/actions";
import { LEAD_FILE_CATEGORIES, getUploadLinkByToken, getClientFilesStorageRuntime } from "@/lib/data/lead-files-repository";
import { humanizeLabel } from "@/lib/labels";

export const dynamic = "force-dynamic";

const errorMessages: Record<string, string> = {
  invalid_or_expired: "This upload link is invalid or has expired. Please ask LIMM Works for a new link.",
  invalid_category: "Please choose a valid file category.",
  max_uploads: "This upload link has reached its upload limit.",
  no_file: "Please choose an image or PDF file before uploading.",
  upload_failed: "The upload could not be saved. Please check the file type and size, then try again."
};

export default async function ClientUploadPage({
  params: paramsPromise,
  searchParams: searchParamsPromise
}: {
  params: Promise<{ token: string }>;
  searchParams?: Promise<{ uploaded?: string; error?: string }>;
}) {
  const [params, searchParams] = await Promise.all([paramsPromise, searchParamsPromise]);
  const uploadLink = await getUploadLinkByToken(params.token).catch(() => null);
  const runtime = getClientFilesStorageRuntime();
  if (!uploadLink) notFound();

  const uploaded = searchParams?.uploaded === "1";
  const error = searchParams?.error ? errorMessages[searchParams.error] ?? "Upload failed. Please try again." : "";

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-4 py-10">
      <section className="rounded-2xl border border-command-line bg-command-card p-6 shadow-premium md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-command-cyan">LIMM Works secure upload</p>
        <h1 className="mt-2 text-3xl font-semibold text-command-text">Send project files for review</h1>
        <p className="mt-3 text-base leading-7 text-command-muted">
          Upload floor plans, site photos, reference images, existing quotations, building rules, or related documents.
          Files are stored privately and are only opened by LIMM Works through short-lived signed links.
        </p>
        <div className="mt-5 rounded-xl border border-command-line bg-command-bg/55 p-4 text-sm text-command-muted">
          Allowed in this version: JPG, PNG, WEBP, HEIC images and PDF documents up to {Math.round(runtime.maxFileBytes / 1024 / 1024)}MB.
        </div>
        {uploaded ? (
          <div className="mt-5 rounded-xl border border-command-green/60 bg-command-green/10 p-4 text-command-green">
            File uploaded successfully. You may upload another file using the same link if needed.
          </div>
        ) : null}
        {error ? (
          <div className="mt-5 rounded-xl border border-command-red/60 bg-command-red/10 p-4 text-command-red">
            {error}
          </div>
        ) : null}
        <form action={uploadClientFileByTokenAction} encType="multipart/form-data" className="mt-6 grid gap-4">
          <input type="hidden" name="token" value={params.token} />
          <label className="grid gap-2 text-sm">
            <span className="font-semibold text-command-text">File category</span>
            <select name="file_category" defaultValue="floor_plan" className="rounded-lg border border-command-line bg-command-bg px-3 py-3 text-command-text">
              {LEAD_FILE_CATEGORIES.map((category) => (
                <option key={category} value={category}>{humanizeLabel(category)}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm">
            <span className="font-semibold text-command-text">File</span>
            <input
              name="file"
              type="file"
              accept="image/*,.pdf,application/pdf"
              capture="environment"
              className="rounded-lg border border-command-line bg-command-bg px-3 py-3 text-command-text file:mr-4 file:rounded-md file:border-0 file:bg-command-gold file:px-3 file:py-2 file:font-semibold file:text-black"
            />
          </label>
          <label className="grid gap-2 text-sm">
            <span className="font-semibold text-command-text">Optional note</span>
            <textarea
              name="notes"
              rows={3}
              placeholder="Example: floor plan for landed kitchen extension"
              className="rounded-lg border border-command-line bg-command-bg px-3 py-3 text-command-text"
            />
          </label>
          <button type="submit" className="rounded-lg border border-command-gold bg-command-gold px-4 py-3 font-semibold text-black">
            Upload File
          </button>
        </form>
        <p className="mt-5 text-xs leading-6 text-command-muted">
          This upload page does not show other lead files and does not expose public storage folders. If this link was shared with you by mistake,
          please close the page.
        </p>
      </section>
    </main>
  );
}
