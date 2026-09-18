import assert from "node:assert/strict";
import test from "node:test";
import { shouldValidateContainerPackages } from "../src/utils/containerPackageValidation.ts";

test("adding an Item Code without container allocation does not require a package match", () => {
  assert.equal(shouldValidateContainerPackages(false, false, false), false);
  assert.equal(shouldValidateContainerPackages(false, true, false), false);
  assert.equal(shouldValidateContainerPackages(false, false, true), false);
  assert.equal(shouldValidateContainerPackages(true, false, false), false);
});

test("changed package quantities or container allocations are checked once allocated", () => {
  assert.equal(shouldValidateContainerPackages(true, true, false), true);
  assert.equal(shouldValidateContainerPackages(true, false, true), true);
});
