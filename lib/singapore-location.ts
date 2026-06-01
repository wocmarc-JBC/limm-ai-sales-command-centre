import type { Lead, LocationConfidence, LocationSource, ProjectAccount } from "@/lib/types";

export type SingaporeAreaKey =
  | "Ang Mo Kio"
  | "Bedok"
  | "Bishan"
  | "Bukit Batok"
  | "Bukit Panjang"
  | "Bukit Timah"
  | "CBD"
  | "Changi"
  | "Choa Chu Kang"
  | "Clementi"
  | "East Coast"
  | "Geylang"
  | "Holland"
  | "Hougang"
  | "Joo Chiat"
  | "Jurong"
  | "Kallang"
  | "Katong"
  | "Mandai"
  | "Marine Parade"
  | "Novena"
  | "Orchard"
  | "Pasir Ris"
  | "Punggol"
  | "Queenstown"
  | "River Valley"
  | "Seletar"
  | "Sembawang"
  | "Sengkang"
  | "Sentosa"
  | "Serangoon"
  | "Serangoon Gardens"
  | "Siglap"
  | "Tampines"
  | "Tanglin"
  | "Thomson"
  | "Toa Payoh"
  | "Upper Bukit Timah"
  | "Woodlands"
  | "Yishun";

export type SingaporeAreaCentroid = {
  area: SingaporeAreaKey;
  region: "Central" | "North" | "North-East" | "East" | "West";
  lat: number;
  lng: number;
  aliases: string[];
};

export type InferredLocation = {
  area: string;
  region: string;
  lat: number | null;
  lng: number | null;
  confidence: LocationConfidence;
  source: LocationSource;
  postalCode: string;
  notes: string;
};

export const singaporeAreaCentroids: Record<SingaporeAreaKey, SingaporeAreaCentroid> = {
  "Ang Mo Kio": { area: "Ang Mo Kio", region: "North-East", lat: 1.3691, lng: 103.8454, aliases: ["amk", "ang mo kio"] },
  Bedok: { area: "Bedok", region: "East", lat: 1.3236, lng: 103.9273, aliases: ["bedok"] },
  Bishan: { area: "Bishan", region: "Central", lat: 1.3508, lng: 103.8485, aliases: ["bishan"] },
  "Bukit Batok": { area: "Bukit Batok", region: "West", lat: 1.3496, lng: 103.7528, aliases: ["bukit batok"] },
  "Bukit Panjang": { area: "Bukit Panjang", region: "West", lat: 1.3774, lng: 103.7719, aliases: ["bukit panjang"] },
  "Bukit Timah": { area: "Bukit Timah", region: "Central", lat: 1.3294, lng: 103.8021, aliases: ["bukit timah", "d10", "district 10"] },
  CBD: { area: "CBD", region: "Central", lat: 1.2839, lng: 103.8515, aliases: ["cbd", "raffles place", "marina bay", "tanjong pagar", "d1"] },
  Changi: { area: "Changi", region: "East", lat: 1.3644, lng: 103.9915, aliases: ["changi"] },
  "Choa Chu Kang": { area: "Choa Chu Kang", region: "West", lat: 1.384, lng: 103.747, aliases: ["choa chu kang", "cck"] },
  Clementi: { area: "Clementi", region: "West", lat: 1.3151, lng: 103.7653, aliases: ["clementi", "d21", "district 21"] },
  "East Coast": { area: "East Coast", region: "East", lat: 1.3034, lng: 103.9125, aliases: ["east coast", "d15", "district 15"] },
  Geylang: { area: "Geylang", region: "Central", lat: 1.3182, lng: 103.8871, aliases: ["geylang"] },
  Holland: { area: "Holland", region: "Central", lat: 1.3122, lng: 103.796, aliases: ["holland", "holland village", "d10"] },
  Hougang: { area: "Hougang", region: "North-East", lat: 1.3713, lng: 103.8926, aliases: ["hougang"] },
  "Joo Chiat": { area: "Joo Chiat", region: "East", lat: 1.3149, lng: 103.901, aliases: ["joo chiat", "d15"] },
  Jurong: { area: "Jurong", region: "West", lat: 1.3329, lng: 103.7436, aliases: ["jurong", "jurong east", "jurong west"] },
  Kallang: { area: "Kallang", region: "Central", lat: 1.3115, lng: 103.8714, aliases: ["kallang"] },
  Katong: { area: "Katong", region: "East", lat: 1.3064, lng: 103.9042, aliases: ["katong", "d15"] },
  Mandai: { area: "Mandai", region: "North", lat: 1.4042, lng: 103.789, aliases: ["mandai"] },
  "Marine Parade": { area: "Marine Parade", region: "East", lat: 1.302, lng: 103.9065, aliases: ["marine parade", "d15"] },
  Novena: { area: "Novena", region: "Central", lat: 1.3206, lng: 103.8439, aliases: ["novena", "d11", "district 11"] },
  Orchard: { area: "Orchard", region: "Central", lat: 1.3048, lng: 103.8318, aliases: ["orchard", "d9", "district 9"] },
  "Pasir Ris": { area: "Pasir Ris", region: "East", lat: 1.3739, lng: 103.9493, aliases: ["pasir ris"] },
  Punggol: { area: "Punggol", region: "North-East", lat: 1.3984, lng: 103.9072, aliases: ["punggol"] },
  Queenstown: { area: "Queenstown", region: "Central", lat: 1.2942, lng: 103.7861, aliases: ["queenstown"] },
  "River Valley": { area: "River Valley", region: "Central", lat: 1.2957, lng: 103.8333, aliases: ["river valley", "d9"] },
  Seletar: { area: "Seletar", region: "North-East", lat: 1.4098, lng: 103.8776, aliases: ["seletar"] },
  Sembawang: { area: "Sembawang", region: "North", lat: 1.4491, lng: 103.8185, aliases: ["sembawang"] },
  Sengkang: { area: "Sengkang", region: "North-East", lat: 1.3868, lng: 103.8914, aliases: ["sengkang"] },
  Sentosa: { area: "Sentosa", region: "Central", lat: 1.2494, lng: 103.8303, aliases: ["sentosa"] },
  Serangoon: { area: "Serangoon", region: "North-East", lat: 1.352, lng: 103.872, aliases: ["serangoon", "d19", "district 19"] },
  "Serangoon Gardens": { area: "Serangoon Gardens", region: "North-East", lat: 1.3635, lng: 103.8667, aliases: ["serangoon gardens", "serangoon garden", "chomp chomp", "d19"] },
  Siglap: { area: "Siglap", region: "East", lat: 1.312, lng: 103.9237, aliases: ["siglap", "d15"] },
  Tampines: { area: "Tampines", region: "East", lat: 1.3525, lng: 103.9447, aliases: ["tampines"] },
  Tanglin: { area: "Tanglin", region: "Central", lat: 1.3065, lng: 103.8159, aliases: ["tanglin", "d10"] },
  Thomson: { area: "Thomson", region: "Central", lat: 1.3547, lng: 103.8329, aliases: ["thomson", "upper thomson", "d20", "district 20"] },
  "Toa Payoh": { area: "Toa Payoh", region: "Central", lat: 1.3343, lng: 103.8563, aliases: ["toa payoh"] },
  "Upper Bukit Timah": { area: "Upper Bukit Timah", region: "West", lat: 1.3526, lng: 103.7764, aliases: ["upper bukit timah", "hillview", "d23", "district 23"] },
  Woodlands: { area: "Woodlands", region: "North", lat: 1.436, lng: 103.786, aliases: ["woodlands"] },
  Yishun: { area: "Yishun", region: "North", lat: 1.4294, lng: 103.8354, aliases: ["yishun"] }
};

const postalPrefixArea: Array<{ test: RegExp; area: SingaporeAreaKey }> = [
  { test: /^01|^02|^03|^04|^05|^06|^07|^08/, area: "CBD" },
  { test: /^09/, area: "Sentosa" },
  { test: /^10|^11|^12|^13/, area: "Queenstown" },
  { test: /^14|^15|^16/, area: "Clementi" },
  { test: /^18|^19|^22|^23/, area: "Orchard" },
  { test: /^25|^26|^27/, area: "Bukit Timah" },
  { test: /^30|^31|^32|^33/, area: "Novena" },
  { test: /^34|^35|^36|^37/, area: "Geylang" },
  { test: /^38|^39|^40/, area: "Kallang" },
  { test: /^42|^43|^44|^45/, area: "East Coast" },
  { test: /^46|^47|^48/, area: "Bedok" },
  { test: /^50|^51/, area: "Pasir Ris" },
  { test: /^52/, area: "Tampines" },
  { test: /^53|^54|^55/, area: "Serangoon" },
  { test: /^56|^57/, area: "Bishan" },
  { test: /^58|^59/, area: "Bukit Timah" },
  { test: /^60|^61|^62|^63|^64/, area: "Jurong" },
  { test: /^65/, area: "Bukit Batok" },
  { test: /^66|^67/, area: "Upper Bukit Timah" },
  { test: /^68/, area: "Choa Chu Kang" },
  { test: /^72|^73/, area: "Woodlands" },
  { test: /^75/, area: "Sembawang" },
  { test: /^76/, area: "Yishun" },
  { test: /^79|^80/, area: "Seletar" },
  { test: /^82/, area: "Punggol" }
];

const areaEntries = Object.values(singaporeAreaCentroids);

export function extractSingaporePostalCode(text: string) {
  const match = text.match(/\b(?:S(?:ingapore)?\s*)?(\d{6})\b/i);
  return match?.[1] ?? "";
}

export function normalizeAreaName(text: string) {
  const lower = text.toLowerCase();
  const match = areaEntries
    .sort((a, b) => Math.max(...b.aliases.map((item) => item.length)) - Math.max(...a.aliases.map((item) => item.length)))
    .find((entry) => entry.aliases.some((alias) => new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(lower)));
  return match?.area ?? "";
}

export function areaFromPostalCode(postalCode: string) {
  const match = postalPrefixArea.find((item) => item.test.test(postalCode));
  return match ? singaporeAreaCentroids[match.area] : null;
}

export function inferSingaporeLocation(input: {
  propertyArea?: string;
  postalCode?: string;
  projectAddress?: string;
  planningArea?: string;
  planningRegion?: string;
  mapLat?: number | null;
  mapLng?: number | null;
  locationConfidence?: LocationConfidence;
  locationSource?: LocationSource;
  text?: string;
}): InferredLocation {
  const combined = [input.propertyArea, input.planningArea, input.postalCode, input.projectAddress, input.text].filter(Boolean).join(" ");
  const postalCode = input.postalCode || extractSingaporePostalCode(combined);
  const areaName = input.propertyArea || input.planningArea || normalizeAreaName(combined);
  const explicitArea = areaName && singaporeAreaCentroids[areaName as SingaporeAreaKey];
  const postalArea = postalCode ? areaFromPostalCode(postalCode) : null;
  const selected = explicitArea || postalArea;
  const hasExactCoordinates = Number.isFinite(input.mapLat) && Number.isFinite(input.mapLng);

  if (hasExactCoordinates) {
    return {
      area: selected?.area ?? areaName ?? "Unknown area",
      region: input.planningRegion || selected?.region || "Unknown",
      lat: input.mapLat ?? null,
      lng: input.mapLng ?? null,
      confidence: input.locationConfidence === "exact" ? "exact" : "postal",
      source: input.locationSource || (input.projectAddress ? "address" : "manual"),
      postalCode,
      notes: "Exact/manual coordinates stored; dashboard still displays area-level context."
    };
  }

  if (selected) {
    return {
      area: selected.area,
      region: input.planningRegion || selected.region,
      lat: selected.lat,
      lng: selected.lng,
      confidence: explicitArea ? "area" : "postal",
      source: input.locationSource || (explicitArea ? "manual" : "postal_code"),
      postalCode,
      notes: explicitArea ? "Approx. area centroid" : "Postal prefix mapped to approx. area centroid"
    };
  }

  return {
    area: "Unknown area",
    region: "Unknown",
    lat: null,
    lng: null,
    confidence: postalCode ? "postal" : "unknown",
    source: postalCode ? "postal_code" : "unknown",
    postalCode,
    notes: postalCode ? "Postal code detected, but no safe local centroid mapping was found." : "No safe Singapore area detected."
  };
}

export function inferLeadLocation(lead: Lead) {
  return inferSingaporeLocation({
    propertyArea: lead.propertyArea,
    postalCode: lead.postalCode,
    projectAddress: lead.projectAddress,
    planningArea: lead.planningArea,
    planningRegion: lead.planningRegion,
    mapLat: lead.mapLat,
    mapLng: lead.mapLng,
    locationConfidence: lead.locationConfidence,
    locationSource: lead.locationSource,
    text: [lead.lastClientMessage, lead.scopeSummary, lead.propertyType, lead.serviceType, lead.locationNotes].filter(Boolean).join(" ")
  });
}

export function inferProjectLocation(project: ProjectAccount, fallbackLead?: Lead) {
  return inferSingaporeLocation({
    propertyArea: project.propertyArea || fallbackLead?.propertyArea,
    postalCode: project.postalCode || fallbackLead?.postalCode,
    projectAddress: project.projectAddress || fallbackLead?.projectAddress,
    planningArea: project.planningArea || fallbackLead?.planningArea,
    planningRegion: project.planningRegion || fallbackLead?.planningRegion,
    mapLat: project.mapLat ?? fallbackLead?.mapLat,
    mapLng: project.mapLng ?? fallbackLead?.mapLng,
    locationConfidence: project.locationConfidence || fallbackLead?.locationConfidence,
    locationSource: project.locationSource || fallbackLead?.locationSource,
    text: [project.scopeSummary, project.propertyType, project.locationNotes, fallbackLead?.lastClientMessage, fallbackLead?.scopeSummary].filter(Boolean).join(" ")
  });
}
