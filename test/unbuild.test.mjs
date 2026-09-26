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


test("CLI rejects unrecognized flags with a clear error", () => {
  const result = spawnSync(process.execPath, ["dist/cli.js", "example.com", "--bogus"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /unrecognized option "--bogus"/);
});

test("CLI rejects a non-numeric --timeout instead of passing NaN through", () => {
  const result = spawnSync(process.execPath, ["dist/cli.js", "example.com", "--timeout", "abc"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /--timeout must be a positive number/);
});

test("CLI requires a url and reports it before touching the browser", () => {
  const result = spawnSync(process.execPath, ["dist/cli.js"], { encoding: "utf8" });
  assert.equal(result.status, 1);
});
