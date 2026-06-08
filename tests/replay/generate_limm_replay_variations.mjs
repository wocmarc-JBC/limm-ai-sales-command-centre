import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function argValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
}

const target = Number(argValue("--target", "1000"));
if (!Number.isFinite(target) || target < 1) {
  console.error("Use --target with a positive number.");
  process.exit(1);
}

const sourcePack = readJson("tests/replay/limm_replay_golden_100.json");
const sourceCases = sourcePack.cases ?? [];
const variants = [
  (text) => text,
  (text) => text.toLowerCase(),
  (text) => `${text} pls`,
  (text) => text.replace(/\bappointment\b/gi, "appt").replace(/\btomorrow\b/gi, "tmr"),
  (text) => text.replace(/\broughly\b/gi, "roughly ah").replace(/\bcan\b/gi, "can"),
  (text) => text.replace(/\bfloor plan\b/gi, "floorplan"),
  (text) => text.replace(/\s+/g, "  ")
];
const shortIntentVariants = [
  (text) => text,
  (text) => text.toLowerCase(),
  (text) => text.replace(/\s+/g, "  ")
];

const generated = [];
let cycle = 0;
while (generated.length < target) {
  for (const baseCase of sourceCases) {
    if (generated.length >= target) break;
    const safeVariants = ["short_ping", "confusion_ping", "thanks_or_acknowledgement"].includes(baseCase.expected_intent)
      ? shortIntentVariants
      : variants;
    const mutate = safeVariants[cycle % safeVariants.length];
    const clientMessage = mutate(baseCase.client_message);
    generated.push({
      ...baseCase,
      id: `${baseCase.id}_var_${String(cycle + 1).padStart(3, "0")}`,
      conversation_id: `${baseCase.conversation_id}_generated`,
      client_message: clientMessage,
      notes: `${baseCase.notes} Generated replay variation ${cycle + 1}.`
    });
  }
  cycle += 1;
}

const pack = {
  version: `v8_0_generated_${target}`,
  generated_from: "tests/replay/limm_replay_golden_100.json",
  generatedAt: new Date().toISOString(),
  cases: generated
};

const outputDir = path.join(ROOT, "tests", "replay", "generated");
fs.mkdirSync(outputDir, { recursive: true });
const outputPath = path.join(outputDir, `limm_replay_${target}.json`);
fs.writeFileSync(outputPath, JSON.stringify(pack, null, 2));
console.log(`Generated ${generated.length} replay cases: ${path.relative(ROOT, outputPath)}`);
