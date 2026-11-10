import { fieldsFromText, type FieldKey } from "@/lib/score/fit";

/**
 * The interests the Scout form offers, each with the wording a matching
 * listing actually uses.
 *
 * `terms` decide the "best matches" tier, so they are deliberately precise: a
 * term that also names something else drags unrelated rows into the top tier,
 * which is worse than leaving them in "related". "security" alone is not a
 * cybersecurity term because "Social Security" is a scholarship sponsor; that is
 * the same lesson `fieldsFromDegreeLanguage` records.
 *
 * Related-field keys are NOT written here. They are derived from the label and
 * terms through `fieldsFromText`, the taxonomy every Fit Score uses, so the two
 * cannot drift (one definition per rule).
 *
 * Matching (see `termMatcher` in query.ts): a term in capitals ("IT", "RN")
 * is an acronym, matched case-sensitively as a whole word, so "IT" never
 * matches the word "it". A term ending in "!" or shorter than five characters
 * must be a whole word (plurals allowed), so "cyber!" does not match
 * "Cyberbullying". Anything else matches at the start of a word, which is how
 * the prefix "accountan" finds both "Accountant" and "Accountancy".
 */
export interface Interest {
  label: string;
  group: string;
  terms: string[];
}

export const INTEREST_GROUPS = [
  "Technology",
  "Engineering",
  "Business",
  "Health",
  "Science",
  "Education & social impact",
  "Law & government",
  "Arts, media & design",
  "Trades & hospitality",
] as const;

export const INTERESTS: Interest[] = [
  // Technology
  { label: "Computer science", group: "Technology", terms: ["computer science", "computing", "computer engineering"] },
  { label: "Software engineering", group: "Technology", terms: ["software", "developer", "SWE", "full stack", "backend", "frontend", "programming"] },
  { label: "Cybersecurity", group: "Technology", terms: ["cybersec", "cyber!", "infosec", "information security", "security analyst", "security engineer", "security research", "security operations", "network security", "application security", "penetration test", "threat intelligence", "soc analyst", "information assurance", "offensive security", "cloud security", "security intern"] },
  { label: "Data science", group: "Technology", terms: ["data science", "data scien", "data analy", "analytics", "data engineer", "statistic", "business intelligence"] },
  { label: "Artificial intelligence & machine learning", group: "Technology", terms: ["artificial intelligence", "machine learning", "deep learning", "AI", "ML", "computer vision", "natural language"] },
  { label: "IT & networking", group: "Technology", terms: ["information technology", "IT", "help desk", "network", "systems administrat", "technical support", "cloud"] },
  { label: "UX & product design", group: "Technology", terms: ["UX", "user experience", "UI", "product design", "interaction design", "user research"] },
  { label: "Product management", group: "Technology", terms: ["product manag", "product owner", "program manag"] },
  { label: "Game development", group: "Technology", terms: ["game", "gaming", "unity", "unreal"] },

  // Engineering
  { label: "Mechanical engineering", group: "Engineering", terms: ["mechanical", "mechatronic", "thermal", "manufacturing engineer"] },
  { label: "Electrical engineering", group: "Engineering", terms: ["electrical", "electronics", "circuit", "power systems", "firmware", "embedded", "hardware engineer"] },
  { label: "Civil engineering", group: "Engineering", terms: ["civil", "structural", "transportation engineer", "geotechnical", "construction engineer"] },
  { label: "Aerospace engineering", group: "Engineering", terms: ["aerospace", "aeronautic", "astronautic", "avionics", "propulsion", "flight"] },
  { label: "Chemical engineering", group: "Engineering", terms: ["chemical engineer", "process engineer"] },
  { label: "Biomedical engineering", group: "Engineering", terms: ["biomedical", "bioengineer", "medical device"] },
  { label: "Industrial engineering", group: "Engineering", terms: ["industrial engineer", "operations research", "quality engineer", "lean", "six sigma"] },
  { label: "Environmental engineering", group: "Engineering", terms: ["environmental engineer", "water resources", "sustainab"] },
  { label: "Robotics", group: "Engineering", terms: ["robotic", "automation", "autonomous"] },

  // Business
  { label: "Business", group: "Business", terms: ["business", "management", "entrepreneur"] },
  { label: "Finance", group: "Business", terms: ["finance", "financial", "investment", "banking", "wealth", "treasury", "equity research"] },
  { label: "Accounting", group: "Business", terms: ["accounting", "accountan", "audit", "tax", "CPA", "bookkeep"] },
  { label: "Marketing", group: "Business", terms: ["marketing", "brand", "social media", "digital media", "advertising", "SEO"] },
  { label: "Sales", group: "Business", terms: ["sales", "business development", "account executive", "account manag"] },
  { label: "Consulting", group: "Business", terms: ["consult", "advisory", "strategy"] },
  { label: "Supply chain & logistics", group: "Business", terms: ["supply chain", "logistic", "procurement", "purchasing", "operations"] },
  { label: "Human resources", group: "Business", terms: ["human resources", "HR", "recruit", "talent", "people operations"] },
  { label: "Economics", group: "Business", terms: ["economic", "econometric"] },
  { label: "Actuarial science", group: "Business", terms: ["actuar", "insurance"] },
  { label: "Real estate", group: "Business", terms: ["real estate", "property", "leasing"] },

  // Health
  { label: "Nursing", group: "Health", terms: ["nursing", "nurse", "RN", "BSN"] },
  { label: "Medicine & pre-med", group: "Health", terms: ["medicine", "medical", "pre med", "premed", "physician", "clinical"] },
  { label: "Public health", group: "Health", terms: ["public health", "epidemiolog", "health policy", "community health"] },
  { label: "Pharmacy", group: "Health", terms: ["pharmac"] },
  { label: "Dentistry", group: "Health", terms: ["dental", "dentist"] },
  { label: "Physical therapy & kinesiology", group: "Health", terms: ["physical therap", "kinesiolog", "occupational therap", "athletic train", "exercise science"] },
  { label: "Veterinary & animal science", group: "Health", terms: ["veterinar", "animal science", "animal care"] },
  { label: "Psychology", group: "Health", terms: ["psycholog", "mental health", "behavioral health", "counsel"] },

  // Science
  { label: "Biology", group: "Science", terms: ["biology", "biolog", "life science", "microbiolog", "genetic", "molecular", "biotech"] },
  { label: "Chemistry", group: "Science", terms: ["chemistry", "chemist", "biochem"] },
  { label: "Physics & astronomy", group: "Science", terms: ["physics", "physicist", "astronom", "astrophysic"] },
  { label: "Mathematics", group: "Science", terms: ["mathemat", "math", "applied math"] },
  { label: "Environmental science", group: "Science", terms: ["environmental", "ecology", "conservation", "climate", "sustainab", "natural resources"] },
  { label: "Agriculture", group: "Science", terms: ["agricultur", "agronom", "farm", "food science", "horticultur"] },
  { label: "Geology & earth science", group: "Science", terms: ["geolog", "geoscien", "earth science", "geospatial", "GIS"] },

  // Education & social impact
  { label: "Education & teaching", group: "Education & social impact", terms: ["education", "teach", "teacher", "tutor", "classroom"] },
  { label: "Social work", group: "Education & social impact", terms: ["social work", "human services", "case manag"] },
  { label: "Nonprofit & community service", group: "Education & social impact", terms: ["nonprofit", "non profit", "community service", "volunteer", "philanthrop"] },
  { label: "Sociology & anthropology", group: "Education & social impact", terms: ["sociolog", "anthropolog", "social science"] },

  // Law & government
  { label: "Law & pre-law", group: "Law & government", terms: ["law school", "law student", "legal", "paralegal", "pre law", "juris"] },
  { label: "Political science & policy", group: "Law & government", terms: ["political", "public policy", "policy", "government", "legislat", "public administration"] },
  { label: "Criminal justice", group: "Law & government", terms: ["criminal justice", "criminology", "law enforcement", "forensic"] },
  { label: "International relations", group: "Law & government", terms: ["international relations", "international affairs", "foreign service", "diplomac"] },

  // Arts, media & design
  { label: "Graphic design", group: "Arts, media & design", terms: ["graphic design", "visual design", "illustrat", "design intern"] },
  { label: "Fine arts", group: "Arts, media & design", terms: ["fine art", "visual art", "studio art", "painting", "art"] },
  { label: "Music & performing arts", group: "Arts, media & design", terms: ["music", "theater", "theatre", "dance", "performing art"] },
  { label: "Journalism & communications", group: "Arts, media & design", terms: ["journalis", "communications", "public relations", "writing", "editorial", "reporter"] },
  { label: "Film & media production", group: "Arts, media & design", terms: ["film", "video", "media production", "broadcast", "animation"] },
  { label: "Architecture", group: "Arts, media & design", terms: ["architect", "urban planning", "interior design"] },
  { label: "English & humanities", group: "Arts, media & design", terms: ["english", "literature", "history", "philosoph", "humanities"] },
  { label: "Languages", group: "Arts, media & design", terms: ["language", "spanish", "french", "linguistic", "translat"] },

  // Trades & hospitality
  { label: "Skilled trades", group: "Trades & hospitality", terms: ["trades", "welding", "electrician", "plumb", "HVAC", "carpent", "apprentice", "automotive", "technician"] },
  { label: "Construction management", group: "Trades & hospitality", terms: ["construction"] },
  { label: "Hospitality & culinary", group: "Trades & hospitality", terms: ["hospitality", "culinary", "hotel", "restaurant", "tourism", "event"] },
  { label: "Aviation", group: "Trades & hospitality", terms: ["aviation", "pilot", "aircraft"] },
  { label: "Sports management", group: "Trades & hospitality", terms: ["sport", "athletic"] },
];

const BY_LABEL = new Map(INTERESTS.map((i) => [i.label.toLowerCase(), i]));

/** Spelling-insensitive key: "Cyber security", "cyber-security" and "cybersecurity" are one. */
function squash(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}
const BY_SQUASHED = new Map(INTERESTS.map((i) => [squash(i.label), i]));

/** How a typed interest reached its catalogue entry. */
export type InterestMatch = "exact" | "contains" | "term";

/**
 * The catalogue entry a typed interest names, or null for an interest we hold
 * no entry for. `how` says whether the text IS the entry ("cyber security" is
 * Cybersecurity), states one of its terms ("infosec"), or contains its label
 * ("marine biology" contains Biology, but is narrower than it).
 */
export function findInterest(text: string): { interest: Interest; how: InterestMatch } | null {
  const t = text.trim();
  if (!t) return null;
  const exact = BY_LABEL.get(t.toLowerCase()) ?? BY_SQUASHED.get(squash(t));
  if (exact) return { interest: exact, how: "exact" };
  const s = squash(t);
  for (const i of INTERESTS) {
    for (const term of i.terms) {
      const bare = term.replace(/!$/, "");
      if (bare.length >= 5 && s === squash(bare)) return { interest: i, how: "term" };
    }
  }
  // Longest label first, so a phrase holding two labels takes the narrower one.
  const byLength = [...INTERESTS].sort((a, b) => b.label.length - a.label.length);
  for (const i of byLength) if (squash(i.label).length >= 4 && s.includes(squash(i.label))) return { interest: i, how: "contains" };
  return null;
}

/** The six original keys: broad tech and business buckets. */
const BROAD_FIELDS = new Set<FieldKey>(["software", "data_ai", "hardware", "quant_finance", "product", "business"]);

/**
 * The related taxonomy fields for an interest, derived from the shared
 * taxonomy rather than restated here.
 *
 * The label is read first: it is the most precise statement of the interest
 * ("Computer science" is software and data). Only when the label names no
 * field are the terms read, and then a specific field (law, nursing) beats the
 * broad buckets the same terms also matched: "legal" is in the business regex,
 * and measured, a Law Scout's related tier filled with business scholarships.
 */
export function relatedFields(interest: Interest | null, typed: string): FieldKey[] {
  const fromLabel = fieldsFromText(interest?.label ?? typed);
  if (fromLabel.length || !interest) return fromLabel;
  const all = fieldsFromText(interest.terms.join(" ").replace(/!/g, ""));
  const specific = all.filter((f) => !BROAD_FIELDS.has(f));
  return specific.length ? specific : all;
}
