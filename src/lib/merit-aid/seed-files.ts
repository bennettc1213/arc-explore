import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { validateMeritSeed, type MeritSeed } from "./types";

export const MERIT_SEED_DIRECTORY = resolve(process.cwd(), "data/merit-aid/schools");

export async function loadMeritSeeds(directory = MERIT_SEED_DIRECTORY): Promise<MeritSeed[]> {
  const files = (await readdir(directory)).filter(file => file.endsWith(".json")).sort();
  if (!files.length) throw new Error("No merit school seed files found");
  const seeds: MeritSeed[] = [];
  for (const file of files) {
    try {
      const seed = validateMeritSeed(JSON.parse(await readFile(resolve(directory, file), "utf8")));
      if (file !== `${seed.slug}.json`) throw new Error("Filename must equal the school slug");
      seeds.push(seed);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Invalid JSON";
      throw new Error(`${file}: ${detail}`);
    }
  }
  return seeds;
}

export async function loadMeritSeed(slug: string): Promise<MeritSeed> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("Provide a school slug, not a path");
  const seed = validateMeritSeed(JSON.parse(await readFile(resolve(MERIT_SEED_DIRECTORY, `${slug}.json`), "utf8")));
  if (seed.slug !== slug) throw new Error("Filename and school slug disagree");
  return seed;
}
