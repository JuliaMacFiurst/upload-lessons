import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateTargetDimensions,
  MAX_RECIPE_UPLOAD_BLOB_BYTES,
  prepareRecipeImageForUpload,
} from "../lib/recipes/upload-optimization.ts";

test("MAX_RECIPE_UPLOAD_BLOB_BYTES is set to 3 MB", () => {
  assert.equal(MAX_RECIPE_UPLOAD_BLOB_BYTES, 3 * 1024 * 1024);
});

test("calculateTargetDimensions preserves 2:3 aspect ratio correctly", () => {
  const result = calculateTargetDimensions(2000, 3000, 0.8, 800, 1200);
  assert.equal(result.width, 1600);
  assert.equal(result.height, 2400);
  assert.equal(result.hitMin, false);
});

test("calculateTargetDimensions clamps to minimum limits preserving ratio", () => {
  const result = calculateTargetDimensions(1000, 1500, 0.5, 800, 1200);
  assert.equal(result.width, 800);
  assert.equal(result.height, 1200);
  assert.equal(result.hitMin, true);
});

test("prepareRecipeImageForUpload returns original blob unchanged if size <= 3 MB", async () => {
  const smallBlob = new Blob([new Uint8Array(1024 * 1024)], { type: "image/png" });
  const result = await prepareRecipeImageForUpload(smallBlob);
  assert.equal(result.wasOptimized, false);
  assert.equal(result.blob, smallBlob);
  assert.equal(result.originalSize, 1024 * 1024);
});
