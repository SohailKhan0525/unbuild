import test from "node:test";
import assert from "node:assert/strict";
import { safeName } from "../dist/unbuild.js";

test("safeName produces a filesystem-safe site name", () => {
  assert.equal(safeName("https://example.com/a path"), "example.com-a-path");
});
