import assert from "node:assert/strict";
import test from "node:test";

const appUpdate = await import("../src/lib/appUpdate.ts");

test("same core release and CI build does not count as update", () => {
  const normalized = appUpdate.normalizeAppUpdateInfo({
    currentVersion: "1.1.13-ci.49.1+4c4e3507d6ca",
    latestVersion: "1.1.13",
    releaseTag: "v1.1.13",
    releaseURL: "https://example.com/releases/v1.1.13",
    hasUpdate: true,
  });
  assert.ok(normalized);
  assert.equal(normalized.hasUpdate, false);
});

test("newer patch release still counts as update", () => {
  const normalized = appUpdate.normalizeAppUpdateInfo({
    currentVersion: "1.1.13-ci.49.1+4c4e3507d6ca",
    latestVersion: "1.1.14",
    releaseTag: "v1.1.14",
    releaseURL: "https://example.com/releases/v1.1.14",
    hasUpdate: true,
  });
  assert.ok(normalized);
  assert.equal(normalized.hasUpdate, true);
});

test("no published release normalizes into a friendly noRelease state", () => {
  const normalized = appUpdate.normalizeAppUpdateInfo({
    currentVersion: "0.1.5",
    latestVersion: "",
    releaseTag: "",
    releaseURL: "https://github.com/hf-hfff/Image-Studio/releases",
    hasUpdate: false,
    noRelease: true,
  });
  assert.ok(normalized);
  assert.equal(normalized.noRelease, true);
  assert.equal(normalized.hasUpdate, false);
  assert.equal(normalized.latestVersion, "");
  assert.equal(normalized.releaseURL, "https://github.com/hf-hfff/Image-Studio/releases");
});

test("payload without versions and without noRelease is dropped", () => {
  const normalized = appUpdate.normalizeAppUpdateInfo({
    currentVersion: "0.1.5",
    latestVersion: "",
    releaseTag: "",
    releaseURL: "",
    hasUpdate: false,
  });
  assert.equal(normalized, null);
});
