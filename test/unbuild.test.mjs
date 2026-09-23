import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { safeName } from "../dist/unbuild.js";

test("safeName produces a filesystem-safe site name", () => {
  assert.equal(safeName("https://example.com/a path"), "example.com-a-path");
});


test("CLI help does not initialize the browser runtime", () => {
  const result = spawnSync(process.execPath, ["dist/cli.js", "--help"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Usage:\s+unbuild <url>/);
  assert.doesNotMatch(result.stderr, /Unsupported platform: android/);
});
