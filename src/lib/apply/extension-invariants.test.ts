/**
 * Guards on the extension source itself.
 *
 * The extension is plain JavaScript loaded by Chrome, so it is not covered by
 * the typechecker and cannot be unit-tested the way the rest of this codebase
 * is. Its two most important properties are therefore asserted here by reading
 * the files — crude, and worth it, because both are the kind of rule that gets
 * broken by someone adding a convenience without knowing why it was absent.
 *
 * A comment saying "never call submit" is a hope. This is a test.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const EXT = join(process.cwd(), "extension");

function source(file: string): string {
  return readFileSync(join(EXT, file), "utf8");
}

/** Strip comments, so the prose explaining a ban does not read as the ban. */
function code(file: string): string {
  return source(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

test("the extension never submits a form on the student's behalf", () => {
  // The line the entire design rests on: Arc fills, the student reads the form
  // and presses the employer's own button. An auto-submit here would be the
  // Phase 05 refusal reintroduced through the browser.
  for (const file of ["content.js", "popup.js", "background.js"]) {
    const js = code(file);
    assert.doesNotMatch(js, /\.click\s*\(/, `${file} must not click anything`);
    assert.doesNotMatch(js, /\.submit\s*\(\s*\)/, `${file} must not submit a form`);
    assert.doesNotMatch(js, /requestSubmit/, `${file} must not call requestSubmit`);
  }
});

test("the extension never touches linkedin.com", () => {
  // CLAUDE.md: never a live fetch against linkedin.com in any form. A content
  // script injected into their pages is that rule broken by another mechanism,
  // so the host must not appear in the manifest at all.
  const manifest = source("manifest.json");
  assert.doesNotMatch(manifest, /linkedin/i);
});

test("the manifest asks only for the hosts it works on", () => {
  const manifest = JSON.parse(source("manifest.json")) as {
    host_permissions: string[];
    optional_host_permissions?: string[];
    content_scripts: Array<{ matches: string[] }>;
    permissions: string[];
  };

  // `<all_urls>` and broad wildcards would make the install prompt say this
  // extension can read every page the student visits, which is both untrue and
  // the reason people uninstall things.
  //
  // THIS COVERS INSTALL-TIME PERMISSIONS ONLY, and the distinction is the whole
  // point of the test below it. `optional_host_permissions` is deliberately
  // broad — Chrome shows none of it at install and prompts for one origin at a
  // time — which is what lets the ~300 one-row scholarship hosts be filled at
  // all without a list nobody could maintain.
  for (const host of [...manifest.host_permissions, ...manifest.content_scripts[0].matches]) {
    assert.doesNotMatch(host, /<all_urls>|^\*:\/\/\*\/|^https:\/\/\*\/\*/, `too broad: ${host}`);
  }

  // The content script runs only on the ATS families in the corpus — never on
  // our own origin, which has no form to fill.
  for (const match of manifest.content_scripts[0].matches) {
    assert.match(match, /greenhouse\.io|lever\.co|ashbyhq\.com|smartrecruiters\.com/);
  }
});

test("a broad optional permission is only ever requested one origin at a time", () => {
  /*
   * THE INVARIANT THAT REPLACES THE OLD ONE'S GUARANTEE.
   *
   * `optional_host_permissions` is broad, so it is *possible* for the code to
   * call `permissions.request({ origins: ["https://<star>/<star>"] })` and
   * obtain, in one click, precisely the blanket access that declaring narrow
   * install-time hosts exists to prevent. Nothing in the manifest stops that —
   * only this does.
   *
   * Every request must be built from a real page URL through
   * `originPatternForUrl`, which returns a single concrete origin. So the
   * student is always asked about the one site they are applying on, and the
   * prompt names it.
   */
  for (const file of ["popup.js", "background.js", "content.js"]) {
    const src = source(file);
    /*
     * Matched inside an `origins:` array specifically, not anywhere in the
     * file. The first version of this asserted the literal `<all_urls>` never
     * appeared at all and failed on popup.js's own comment explaining why it
     * is not used — a test that forbids naming the thing you are avoiding
     * makes the code less clear, not safer.
     */
    const requested = [...src.matchAll(/origins\s*:\s*\[([^\]]*)\]/g)].map((m) => m[1]);
    for (const arg of requested) {
      assert.doesNotMatch(arg, /https:\/\/\*|<all_urls>/, `${file} requests blanket access`);
    }
  }

  // And the popup — the only surface where a permission prompt can legally be
  // raised — must go through the shared helper rather than building a pattern
  // of its own, so there is one definition of what we ask for.
  assert.match(source("popup.js"), /originPatternForUrl/);
});

test("the extension declares no permission it does not use", () => {
  const manifest = JSON.parse(source("manifest.json")) as { permissions: string[] };
  // `storage` holds the Arc address; `activeTab` reads the current tab's URL;
  // `scripting` injects the content script into a site the student has just
  // granted, which declares no script for it and would otherwise need a reload
  // they have no reason to expect. Anything beyond those three should have to
  // justify itself here first.
  assert.deepEqual([...manifest.permissions].sort(), ["activeTab", "scripting", "storage"]);
});

/* ------------------------------------------------------------------ *
 * The embedded path
 *
 * `all_frames: true` lets the content script run inside a form Arc has framed
 * in its own page. That is what makes applying without leaving the site
 * possible, and it is also the one change that widens who can talk to the
 * script — so the guard on the other end is asserted here rather than trusted.
 * ------------------------------------------------------------------ */

test("the content script runs in subframes, which is what the embedded flow needs", () => {
  const manifest = JSON.parse(source("manifest.json")) as {
    content_scripts: Array<{ all_frames?: boolean }>;
  };
  assert.equal(manifest.content_scripts[0].all_frames, true);
});

test("the embed bridge refuses any parent that is not Arc", () => {
  const js = code("content.js");

  // Without an origin check, any site could frame the same Greenhouse form and
  // shout "fill" at it, pulling a signed-in student's real name, school and
  // contact details into a document that site controls. `event.origin` is set
  // by the browser and cannot be forged by the sender, which is the whole
  // reason it is the thing worth checking.
  assert.match(js, /event\.origin/, "content.js must check the sender's origin");
  assert.match(js, /event\.source\s*!==\s*window\.parent/, "must require the sender be the parent");
  assert.match(js, /window\.parent\s*!==\s*window\.top/, "must require the parent be the top document");

  // A wildcard target would broadcast the reply — which carries what was
  // filled and which fields were blocked — to whatever is listening.
  assert.doesNotMatch(js, /postMessage\([^)]*,\s*["']\*["']\s*\)/, "must never postMessage to '*'");
});

test("compiled vendor modules use file extensions Chrome can load", () => {
  // A missing ".js" on `from "./frame-headers"` is why the popup sat on
  // "checking this page…" forever: the module graph failed and main() never ran.
  const vendor = join(EXT, "vendor");
  const files = ["apply-url.js", "autofill.js", "frame-headers.js", "submitted.js"];
  for (const file of files) {
    const src = readFileSync(join(vendor, file), "utf8");
    for (const spec of src.matchAll(/from\s+["'](\.[^"']+)["']/g)) {
      assert.match(spec[1], /\.js$/, `${file} imports ${spec[1]} without .js`);
    }
  }
});

test("the embedded path still never submits, and still fills through the tested matcher", () => {
  const js = code("content.js");
  // Re-asserted specifically for the new path: an embedded form is still the
  // employer's form and the student still presses their button.
  assert.doesNotMatch(js, /\.click\s*\(/);
  assert.doesNotMatch(js, /requestSubmit/);
  // The embed path must reuse `fill`, not grow a second filling routine that
  // could drift from `matchFieldKey`'s decisions.
  assert.match(js, /INSTELA_EMBED_FILL/);
  assert.equal((js.match(/async function fill\(/g) ?? []).length, 1);
});
