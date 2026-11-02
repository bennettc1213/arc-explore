import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { FEATURE_KEYS, FEATURES, TIER_IDS, evaluateFeature } from "@/lib/pricing/tiers";

import { JUMP_IN_IDS, PORTAL_ART_IDS, resolvePortalTiles, type PortalTile } from "./destinations";

const byId = (tiles: PortalTile[], id: string) => {
  const tile = tiles.find((t) => t.id === id);
  assert.ok(tile, `no tile named ${id}`);
  return tile;
};

describe("portal catalog", () => {
  it("has exactly one tile per art id, in every plan", () => {
    for (const tier of TIER_IDS) {
      const ids = resolvePortalTiles(tier).map((t) => t.id);
      assert.deepEqual([...ids].sort(), [...PORTAL_ART_IDS].sort());
    }
  });

  it("only names features that exist in the catalog", () => {
    for (const tile of resolvePortalTiles("free")) {
      if (tile.feature) assert.ok(FEATURE_KEYS.includes(tile.feature), `${tile.id} -> ${tile.feature}`);
    }
  });

  it("lays out each bento row to exactly twelve columns", () => {
    const spans = resolvePortalTiles("free").map((t) => t.span);
    let row = 0;
    for (const span of spans) {
      row += span;
      assert.ok(row <= 12, `a row overflowed 12 columns at span ${span}`);
      if (row === 12) row = 0;
    }
    assert.equal(row, 0, "the last row does not close at 12");
  });

  it("repeats only tiles that exist in the jump-in row", () => {
    for (const id of JUMP_IN_IDS) assert.ok(PORTAL_ART_IDS.includes(id));
  });
});

describe("a free plan", () => {
  const tiles = resolvePortalTiles("free");

  it("locks what the plan does not include and routes it to pricing, not the tool", () => {
    for (const id of ["essay", "extension"]) {
      const tile = byId(tiles, id);
      assert.equal(tile.state, "locked", id);
      assert.equal(tile.pill, "Pro", id);
      // A locked tile that linked to the tool would make the lock decorative.
      assert.equal(tile.href, `/pricing?feature=${tile.feature}`, id);
    }
  });

  it("keeps the capped free tools open, and says what the cap is", () => {
    assert.equal(byId(tiles, "tracker").state, "limited");
    assert.equal(byId(tiles, "tracker").note, "Free: up to 5 tracked listings");
    assert.equal(byId(tiles, "github").note, "Free: 1 run");
    assert.equal(byId(tiles, "linkedin").note, "Free: 1 run");
    assert.equal(byId(tiles, "resume").note, "Free: 1 critique");
    assert.equal(byId(tiles, "tracker").href, "/tracker");
  });

  it("lets free search every listing but says the ranked window is capped", () => {
    for (const id of ["merit", "scholarships", "internships"]) {
      const tile = byId(tiles, id);
      assert.equal(tile.state, "limited", id);
      assert.match(tile.note ?? "", /top \d+ matches/, id);
      assert.ok(tile.href?.startsWith("/explore"), id);
    }
  });

  it("never lets an unbuilt feature look openable", () => {
    const soon = byId(tiles, "triage");
    assert.equal(soon.state, "soon");
    assert.equal(soon.href, null);
  });
});

describe("a paid plan", () => {
  const tiles = resolvePortalTiles("apply");

  it("opens everything that is built, with no pill and no cap note", () => {
    for (const tile of tiles) {
      if (tile.id === "triage") continue;
      assert.equal(tile.state, "open", tile.id);
      assert.equal(tile.pill, null, tile.id);
      assert.equal(tile.note, null, tile.id);
      assert.ok(tile.href && !tile.href.startsWith("/pricing"), tile.id);
    }
  });

  it("still refuses to open an unbuilt feature, even for the plan that pays for it", () => {
    const soon = byId(tiles, "triage");
    assert.equal(soon.state, "soon");
    assert.equal(soon.href, null);
  });
});

describe("truthfulness", () => {
  it("carries the unverified caveat for the extension on every plan, locked or not", () => {
    // Sold with the caveat said out loud rather than discovered after paying.
    for (const tier of TIER_IDS) {
      const tile = byId(resolvePortalTiles(tier), "extension");
      assert.equal(FEATURES.extension_autofill_internships.status, "unverified");
      assert.equal(tile.caveat, "Built, not yet verified end-to-end");
    }
  });

  it("agrees with evaluateFeature on every tile — the portal decides nothing itself", () => {
    for (const tier of TIER_IDS) {
      for (const tile of resolvePortalTiles(tier)) {
        if (!tile.feature) continue;
        const access = evaluateFeature(tier, tile.feature);
        if (access.reason === "coming_soon") assert.equal(tile.state, "soon", `${tier}/${tile.id}`);
        else if (!access.usable) assert.equal(tile.state, "locked", `${tier}/${tile.id}`);
        else assert.notEqual(tile.state, "locked", `${tier}/${tile.id}`);
      }
    }
  });
});
