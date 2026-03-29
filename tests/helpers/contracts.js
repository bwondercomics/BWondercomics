import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const fixturePath = resolve(process.cwd(), "tests/fixtures/contract-fixtures.json");
const fixtures = JSON.parse(readFileSync(fixturePath, "utf-8"));

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function merge(base, overrides) {
  if (!isPlainObject(base) || !isPlainObject(overrides)) {
    return clone(overrides);
  }

  const merged = { ...base };
  Object.entries(overrides).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      merged[key] = clone(value);
      return;
    }
    if (isPlainObject(value) && isPlainObject(base[key])) {
      merged[key] = merge(base[key], value);
      return;
    }
    merged[key] = clone(value);
  });
  return merged;
}

export function getContractFixtures() {
  return clone(fixtures);
}

export function getContractFixture(key) {
  return clone(fixtures[key]);
}

export function buildContractFixture(key, overrides = {}) {
  return merge(getContractFixture(key), overrides);
}
