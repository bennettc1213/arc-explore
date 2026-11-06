import assert from "node:assert/strict";
import { test } from "node:test";
import { isPublicFrameAddress, probeApplicationFrame } from "./frame-probe";

const publicLookup = async () => [{ address: "8.8.8.8", family: 4 }];

test("an unchecked public application can establish embedding permission immediately", async () => {
  let calls = 0;
  const result = await probeApplicationFrame("https://awards.example/application", {
    lookup: publicLookup,
    fetch: async (_, init) => {
      calls++;
      assert.equal(init?.credentials, "omit");
      assert.equal(init?.redirect, "manual");
      assert.equal(new Headers(init?.headers).has("cookie"), false);
      return new Response(null, { status: 200 });
    },
  });
  assert.equal(result, "allow");
  assert.equal(calls, 2);
});

test("a real framing denial prevents embedding, including on the second observation", async () => {
  for (const denyOn of [1, 2]) {
    let calls = 0;
    const result = await probeApplicationFrame("https://awards.example/application", {
      lookup: publicLookup,
      fetch: async () => new Response(null, { headers: ++calls === denyOn ? { "X-Frame-Options": "DENY" } : {} }),
    });
    assert.equal(result, "deny");
    assert.equal(calls, denyOn);
  }
});

test("redirected application pages are checked at their final destination", async () => {
  const visited: string[] = [];
  const result = await probeApplicationFrame("https://awards.example/start", {
    lookup: publicLookup,
    fetch: async url => {
      visited.push(String(url));
      return String(url).endsWith("/start")
        ? new Response(null, { status: 302, headers: { location: "/forms/apply" } })
        : new Response(null, { headers: { "Content-Security-Policy": "frame-ancestors 'none'" } });
    },
  });
  assert.equal(result, "deny");
  assert.deepEqual(visited, ["https://awards.example/start", "https://awards.example/forms/apply"]);
});

test("a private redirect is stopped before making the redirected request", async () => {
  let calls = 0;
  assert.equal(await probeApplicationFrame("https://awards.example/start", {
    lookup: publicLookup,
    fetch: async () => { calls++; return new Response(null, { status: 302, headers: { location: "https://127.0.0.1/private" } }); },
  }), "unknown");
  assert.equal(calls, 1);
});

test("a cross-site redirect is not marked supported before its form is connected", async () => {
  let calls = 0;
  assert.equal(await probeApplicationFrame("https://awards.example/start", {
    lookup: publicLookup,
    fetch: async () => { calls++; return new Response(null, { status: 302, headers: { location: "https://other.example/apply" } }); },
  }), "unknown");
  assert.equal(calls, 1);
});

test("errors and sign-in refusals stay unverified rather than being described as frame denials", async () => {
  for (const status of [401, 403, 429, 500]) {
    assert.equal(await probeApplicationFrame("https://awards.example/apply", {
      lookup: publicLookup, fetch: async () => new Response(null, { status }),
    }), "unknown");
  }
  assert.equal(await probeApplicationFrame("https://awards.example/apply", {
    lookup: publicLookup, fetch: async () => { throw new Error("network failure"); },
  }), "unknown");
});

test("local, metadata, mapped and non-public addresses are not probed", () => {
  for (const address of ["127.0.0.1", "10.0.0.1", "172.16.0.1", "192.168.0.1", "169.254.169.254", "100.64.0.1", "::1", "::ffff:127.0.0.1", "fc00::1", "fe80::1", "2001:db8::1", "invalid"]) {
    assert.equal(isPublicFrameAddress(address), false, address);
  }
  assert.equal(isPublicFrameAddress("8.8.8.8"), true);
  assert.equal(isPublicFrameAddress("2606:4700:4700::1111"), true);
});
