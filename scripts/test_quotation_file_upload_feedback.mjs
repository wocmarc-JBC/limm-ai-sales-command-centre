import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

const actions = read("lib/actions.ts");
const leadPage = read("app/leads/[id]/page.tsx");

assert(actions.includes("allowedQuotationMimeTypes"), "Action must validate selected quotation file MIME type before upload.");
assert(
  /file instanceof File && file\.name\.trim\(\)\.length > 0 && file\.size > 0/.test(actions),
  "Valid upload must require File plus non-empty file name and positive file size."
);
assert(
  !/file\.size <= 0[\s\S]{0,220}Selected quotation file is empty/.test(actions),
  "Zero-byte quotation file objects must not redirect or block no-file quotation creation."
);
assert(
  /hasValidQuotationFile && !allowedQuotationMimeTypes\.has/.test(actions) &&
    actions.includes("Selected quotation file type is not supported."),
  "Unsupported non-empty quotation file type must redirect with friendly failure feedback."
);
assert(
  /const quotation = hasValidQuotationFile[\s\S]{0,500}await uploadDraftQuotation[\s\S]{0,900}: await createQuotationPackage\(baseInput\)/.test(actions),
  "No file selected and zero-byte file objects must create a quotation package normally, while valid non-empty files still upload."
);
assert(
  actions.includes("sizeBytes: file.size") && actions.includes("Buffer.from(await file.arrayBuffer())"),
  "Valid non-empty file upload behavior must remain unchanged."
);
assert(
  leadPage.includes('quotationStatus?: QuotationStatus') &&
    leadPage.includes('data-testid="quotation-package-failed-feedback"') &&
    leadPage.includes("Quotation package was not created"),
  "Lead detail page must render visible quotation failure feedback."
);
assert(
  leadPage.includes("File upload is optional.") &&
    leadPage.includes("Create the quotation package without a file"),
  "Lead detail page must explain that quotation file upload is optional."
);
const quotationAction = actions.slice(actions.indexOf("createQuotationPackageAction"), actions.indexOf("submitQuotationForBossReviewAction"));
assert(!/sendReply\(/.test(quotationAction), "Quotation file feedback hotfix must not add WhatsApp sending.");
assert(!/price estimate/i.test(quotationAction), "Quotation action must not add price estimate automation.");

console.log("PASS: quotation file upload feedback treats zero-byte file objects as no upload and keeps invalid non-empty upload feedback.");
