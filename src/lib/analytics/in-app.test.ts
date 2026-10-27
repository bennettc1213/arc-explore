import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { isInAppBrowser } from "./in-app";

describe("isInAppBrowser", () => {
  test("recognises the common social webviews", () => {
    assert.equal(
      isInAppBrowser(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 300.0.0",
      ),
      true,
    );
    assert.equal(
      isInAppBrowser("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) [FBAN/FBIOS;FBAV/440.0]"),
      true,
    );
    assert.equal(
      isInAppBrowser("Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP1A; wv) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36"),
      true,
    );
  });

  test("ordinary browsers and a missing header are not in-app", () => {
    assert.equal(
      isInAppBrowser("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"),
      false,
    );
    assert.equal(
      isInAppBrowser("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1"),
      false,
    );
    assert.equal(isInAppBrowser(null), false);
  });
});
