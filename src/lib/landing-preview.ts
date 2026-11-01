/** Public, deliberately small preview payloads. No profile or fit scores. */
export const PREVIEW_AREAS = [
  { key: "software", label: "Software engineering" },
  { key: "data_ai", label: "Data & AI" },
  { key: "business", label: "Business & consulting" },
  { key: "product", label: "Product & design" },
] as const;

export interface LandingListing {
  id: string;
  kind: "internship" | "scholarship";
  title: string;
  company: string;
  detail: string;
  verified: string;
  deadline: string | null;
  caution: boolean;
}

export interface PreviewLane {
  key: string;
  total: number;
  items: LandingListing[];
}
