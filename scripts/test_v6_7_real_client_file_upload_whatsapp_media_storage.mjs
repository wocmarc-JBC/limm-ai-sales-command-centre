import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const migration = read("supabase/migrations/023_v6_7_real_client_file_upload.sql");
const migrationOrder = read("supabase/MIGRATION_ORDER.md");
const repository = read("lib/data/lead-files-repository.ts");
const mediaStorage = read("lib/whatsapp-media-storage.ts");
const whatsappAutoReply = read("lib/whatsapp-auto-reply.ts");
const whatsappAdapter = read("lib/adapters/whatsapp-adapter.ts");
const actions = read("lib/actions.ts");
const uploadPage = read("app/upload/[token]/page.tsx");
const clientFilesPage = read("app/client-files/page.tsx");
const leadDetail = read("app/leads/[id]/page.tsx");
const shellChrome = read("components/ShellChrome.tsx");
const health = read("app/api/whatsapp/health/route.ts");
const types = read("lib/types.ts");
const mappers = read("lib/data/mappers.ts");
const mockStore = read("lib/data/mock-store.ts");
const docs = read("docs/V6_7_REAL_CLIENT_FILE_UPLOAD_WHATSAPP_MEDIA_STORAGE.md");
const pkg = read("package.json");

assert(migration.includes("create table if not exists lead_files"), "Migration must create lead_files.");
assert(migration.includes("create table if not exists lead_upload_links"), "Migration must create lead_upload_links.");
assert(migration.includes("storage.buckets") && migration.includes("'client-files'") && migration.includes("public = false"), "Migration must create or document private client-files bucket.");
for (const phrase of [
  "floor_plan",
  "site_photos",
  "reference_images",
  "existing_quotation",
  "building_rules",
  "other_documents",
  "missing",
  "received",
  "reviewed",
  "needs_clarification",
  "archived",
  "voided",
  "lead_files_lead_id_idx",
  "lead_upload_links_token_hash_idx"
]) {
  assert(migration.includes(phrase), `Migration missing ${phrase}`);
}
assert(migrationOrder.includes("023_v6_7_real_client_file_upload.sql"), "Migration order must include v6.7 migration.");

for (const phrase of [
  "CLIENT_FILES_BUCKET = \"client-files\"",
  "MAX_CLIENT_FILE_BYTES = 20 * 1024 * 1024",
  "LEAD_FILE_CATEGORIES",
  "LEAD_FILE_STATUSES",
  "classifyLeadFileCategory",
  "validateLeadFileUpload",
  "createLeadUploadLink",
  "tokenHash",
  "randomBytes(32).toString(\"base64url\")",
  "rawTokenStored: false",
  "uploadLeadFile",
  "createLeadFileMetadataOnly",
  "getSignedLeadFileUrl",
  "createSignedUrl",
  "markLeadFileReviewed",
  "voidLeadFile",
  "file_status: \"voided\"",
  "updateReadinessFromFile",
  "meetingReadinessFileConnection",
  "quotationReadinessFileConnection"
]) {
  assert(repository.includes(phrase), `Lead files repository missing ${phrase}`);
}
assert(repository.includes("if (/\\b(reference|design|moodboard") || repository.includes("reference|design|moodboard"), "Reference/design captions must map to reference_images.");
assert(repository.includes("if (/^image\\b|image\\//i.test(text)) return \"site_photos\";"), "Image files must default to site_photos.");
assert(repository.includes("floor\\s*plan") && repository.includes("return \"floor_plan\""), "Floor plan captions/documents must map to floor_plan.");
assert(repository.includes("quotation") && repository.includes("return \"existing_quotation\""), "Quotation captions must map to existing_quotation.");
assert(repository.includes("adminClient()") && repository.includes("getSupabaseAdminClient"), "Private file writes and signed URLs must use server-only admin helper.");

for (const phrase of [
  "storeWhatsAppMediaForLead",
  "fetchWhatsAppMediaBuffer",
  "https://graph.facebook.com/",
  "Authorization: `Bearer ${token}`",
  "metadata?.url",
  "uploadLeadFile",
  "createLeadFileMetadataOnly",
  "missing_media_id",
  "WhatsApp media received but not stored"
]) {
  assert(mediaStorage.includes(phrase), `WhatsApp media storage missing ${phrase}`);
}
assert(!/console\.(log|error|warn)/.test(mediaStorage), "WhatsApp media storage must not print tokens or media URLs.");
assert(whatsappAutoReply.includes("storeWhatsAppMediaForLead"), "WhatsApp webhook handler must call media storage helper.");
assert(whatsappAutoReply.includes("whatsapp_media_stored") && whatsappAutoReply.includes("whatsapp_media_received_but_not_stored"), "WhatsApp media storage audit/log states missing.");
assert(whatsappAutoReply.includes("whatsapp_media_storage_failed"), "WhatsApp media storage failures must be audited without crashing webhook.");

for (const phrase of ["messaging_product", "recipient_type", "preview_url", "body"]) {
  assert(whatsappAdapter.includes(phrase), `Known-good WhatsApp payload shape missing ${phrase}`);
}

for (const phrase of [
  "createLeadUploadLinkAction",
  "markLeadFileReviewedAction",
  "voidLeadFileAction",
  "uploadClientFileByTokenAction",
  "Buffer.from(await file.arrayBuffer())",
  "markUploadLinkUsed",
  "redirect(`/upload/${encodeURIComponent(token)}?uploaded=1`"
]) {
  assert(actions.includes(phrase), `Server action missing ${phrase}`);
}

assert(exists("app/upload/[token]/page.tsx"), "Secure public token upload page must exist.");
for (const phrase of ["LIMM Works secure upload", "uploadClientFileByTokenAction", "accept=\"image/jpeg,image/png,image/webp,image/heic,application/pdf\"", "Files are stored privately"]) {
  assert(uploadPage.includes(phrase), `Upload page missing ${phrase}`);
}
assert(!/SUPABASE_SERVICE_ROLE_KEY|WHATSAPP_ACCESS_TOKEN/.test(uploadPage), "Upload page must not reference secrets.");

for (const phrase of [
  "Real client storage",
  "Files received",
  "Needs review",
  "Active upload links",
  "Missing Floor Plan",
  "Missing Site Photos",
  "listAllLeadFiles",
  "listLeadUploadLinks",
  "Open Lead Files"
]) {
  assert(clientFilesPage.includes(phrase), `Client Files page missing real-data UI phrase: ${phrase}`);
}
for (const forbidden of ["Coming soon", "Storage disabled", "Client file upload is not enabled yet.", "Daniel Tan", "Apex Clinic", "Mock folder", "fake upload"]) {
  assert(!clientFilesPage.includes(forbidden), `Client Files page must not show old/mock wording: ${forbidden}`);
}
assert(shellChrome.includes('{ href: "/client-files", label: "Client Files" }'), "Client Files nav must be active now that real storage exists.");

for (const phrase of [
  "Files / Meeting Prep Documents",
  "Client file storage",
  "View / Download",
  "Mark Reviewed",
  "Void File Record",
  "Create Upload Link",
  "Upload Link Not Created Yet",
  "Floor Plan Missing",
  "Site Photos Missing",
  "getSignedLeadFileUrl",
  "listLeadFiles",
  "listLeadUploadLinks"
]) {
  assert(leadDetail.includes(phrase), `Lead detail file panel missing ${phrase}`);
}

assert(types.includes("export interface LeadFile") && types.includes("export interface LeadUploadLink"), "Lead file types must exist.");
assert(mappers.includes("mapLeadFileRow") && mappers.includes("mapLeadUploadLinkRow"), "Lead file mappers must exist.");
assert(mockStore.includes("leadFiles: LeadFile[]") && mockStore.includes("leadUploadLinks: LeadUploadLink[]"), "Mock store must carry file/link arrays for mock mode.");

for (const field of [
  'version: "v6_7_real_client_file_upload_whatsapp_media_storage"',
  'salesBrainVersion: "v6.7"',
  "clientFileStorageAvailable",
  "supabaseClientFilesBucketConfigured",
  "leadFilesTableAvailable",
  "whatsappMediaStorageAvailable",
  "whatsappImageStorageAvailable",
  "whatsappDocumentStorageAvailable",
  "clientUploadLinkAvailable",
  "secureUploadTokenAvailable",
  "leadDetailFilePanelAvailable",
  "clientFilesPageRealDataAvailable",
  "signedFileUrlAvailable",
  "fileCategoryDetectionAvailable",
  "fileStatusTrackingAvailable",
  "fileReviewWorkflowAvailable",
  "fileVoidInsteadOfDeleteAvailable",
  "fileUploadAuditAvailable",
  "meetingReadinessFileConnectionAvailable",
  "quotationReadinessFileConnectionAvailable",
  "mockClientFilesRemoved",
  "priceGuideOnHold",
  "calendarAutoBookingEnabled",
  "voiceTranscriptionEnabled",
  "gstRegistered"
]) {
  assert(health.includes(field), `Health endpoint missing v6.7 proof field: ${field}`);
}

assert(pkg.includes('"test:v6.7"'), "package.json must expose v6.7 test.");
assert(pkg.includes("test_v6_7_real_client_file_upload_whatsapp_media_storage.mjs"), "package.json must wire v6.7 test script.");
assert(docs.includes("client-files") && docs.includes("signed URLs") && docs.includes("WhatsApp media flow"), "v6.7 docs must explain storage, signed URLs, and WhatsApp media flow.");

const frontendSources = [
  ...["app", "components"].flatMap((dir) => {
    const base = path.join(root, dir);
    const files = [];
    const walk = (current) => {
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) walk(full);
        if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
          const relative = path.relative(root, full);
          if (!relative.startsWith(`app${path.sep}api${path.sep}`)) files.push(full);
        }
      }
    };
    walk(base);
    return files;
  })
].map((file) => fs.readFileSync(file, "utf8")).join("\n");
assert(!/SUPABASE_SERVICE_ROLE_KEY|WHATSAPP_ACCESS_TOKEN|WHATSAPP_PHONE_NUMBER_ID/.test(frontendSources), "Frontend/app UI must not reference server secrets.");

const safetySources = [repository, mediaStorage, whatsappAutoReply, actions, clientFilesPage, leadDetail, uploadPage, health].join("\n");
for (const forbidden of [
  "free consultation",
  "quote range",
  "rough estimate",
  "package price",
  "from $",
  "around $",
  "Tax Invoice",
  "GST calculation",
  "calendar auto booking enabled"
]) {
  assert(!safetySources.toLowerCase().includes(forbidden.toLowerCase()), `Forbidden safety regression found: ${forbidden}`);
}
assert(!safetySources.includes("115395" + "2887800145"), "Wrong WhatsApp Phone Number ID must not be reintroduced.");
assert(!/public:\s*true|public\s*=\s*true/i.test(migration + repository), "Client files must not use a public bucket.");
assert(!/\.remove\(|\.delete\(/.test(repository), "Repository must not hard-delete files by default.");

console.log("PASS: v6.7 real client file upload and WhatsApp media storage checks passed.");
