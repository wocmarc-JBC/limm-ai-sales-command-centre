export const singaporeRenovationShortforms = [
  { key: "demo", meaning: "demolition or hacking works" },
  { key: "reno", meaning: "renovation" },
  { key: "toilet", meaning: "bathroom" },
  { key: "overlay", meaning: "tile overlay" },
  { key: "pe", meaning: "professional engineer" },
  { key: "submission", meaning: "authority submission or checking may be required" },
  { key: "appt", meaning: "appointment" },
  { key: "got do", meaning: "service availability enquiry" },
  { key: "can do", meaning: "capability enquiry" }
];

export function normaliseV6Text(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff\s]/g, " ").replace(/\s+/g, " ").trim();
}

export function detectRenovationShortforms(text: string) {
  const normalized = normaliseV6Text(text);
  return singaporeRenovationShortforms
    .filter((item) => new RegExp(`\\b${item.key.replace(/\s+/g, "\\s+")}\\b`, "i").test(normalized))
    .map((item) => `${item.key}=${item.meaning}`);
}

export function detectWallCount(text: string) {
  const normalized = normaliseV6Text(text);
  if (/\b(?:demo|hack|knock|remove|tear down)\s+(?:two|2)\s+walls?\b/i.test(normalized)) return 2;
  const match = normalized.match(/\b(?:demo|hack|knock|remove|tear down)\s+(\d+)\s+walls?\b/i);
  return match ? Number(match[1]) : 0;
}

export function isChineseText(text: string) {
  return /[\u4e00-\u9fff]/.test(text);
}

export function isSinglishText(text: string) {
  return /\b(how much ah|price ah|budget how|can make appt anot|can meet anot|got photo or not|got landed photo|can do anot|need approval meh|reno landed can|can hack wall or not)\b/i.test(text);
}
