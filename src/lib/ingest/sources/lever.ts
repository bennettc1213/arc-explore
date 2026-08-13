/**
 * Lever public postings. No auth required.
 *
 *   https://api.lever.co/v0/postings/{slug}?mode=json
 *
 * Returns a bare array (not an envelope). `createdAt` is unix milliseconds.
 * `categories.allLocations` carries the full city list while
 * `categories.location` is only the primary one — we take the union.
 */

import { getJson } from "../http";
import type { BoardAdapter, FetchBoardResult, SourcePosting } from "../types";

interface LeverPosting {
  id: string;
  text: string;
  hostedUrl?: string | null;
  applyUrl?: string | null;
  createdAt?: number | null;
  workplaceType?: string | null;
  descriptionPlain?: string | null;
  descriptionBodyPlain?: string | null;
  categories?: {
    location?: string | null;
    allLocations?: string[] | null;
    commitment?: string | null;
    department?: string | null;
    team?: string | null;
  } | null;
}

export const lever: BoardAdapter = {
  name: "lever",

  async fetchBoard(slug: string, opts): Promise<FetchBoardResult> {
    const url = `https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`;
    const res = await getJson<LeverPosting[]>(url, { etag: opts?.etag });

    if (res.notModified || !res.data) {
      return { postings: [], etag: res.etag, notModified: true };
    }

    // Lever answers 200 with {"ok":false} for an unknown board.
    if (!Array.isArray(res.data)) {
      return { postings: [], etag: res.etag, notModified: false };
    }

    const postings: SourcePosting[] = res.data.map((p) => {
      const locations = Array.from(
        new Set(
          [p.categories?.location ?? null, ...(p.categories?.allLocations ?? [])].filter(
            (x): x is string => Boolean(x && x.trim()),
          ),
        ),
      );

      const description =
        p.descriptionPlain ?? p.descriptionBodyPlain ?? null;

      return {
        source: "lever",
        sourceId: p.id,
        companyName: slug,
        title: (p.text ?? "").trim(),
        url: p.hostedUrl ?? p.applyUrl ?? "",
        locations,
        isRemote:
          /remote/i.test(p.workplaceType ?? "") ||
          locations.some((l) => /\bremote\b/i.test(l)),
        postedAt:
          typeof p.createdAt === "number" && Number.isFinite(p.createdAt)
            ? new Date(p.createdAt)
            : null,
        deadlineAt: null,
        descriptionText: description?.replace(/\s+/g, " ").trim() ?? null,
        employmentHint: p.categories?.commitment ?? null,
        raw: {
          ...p,
          descriptionPlain: undefined,
          descriptionBodyPlain: undefined,
          description: undefined,
          descriptionBody: undefined,
        },
      };
    });

    return { postings, etag: res.etag, notModified: false };
  },
};
