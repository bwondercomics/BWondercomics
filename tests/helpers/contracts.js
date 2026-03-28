import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const fixturePath = resolve(process.cwd(), "tests/fixtures/contract-fixtures.json");
const fixtures = JSON.parse(readFileSync(fixturePath, "utf-8"));

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function getContractFixtures() {
  return clone(fixtures);
}

export function getContractFixture(key) {
  return clone(fixtures[key]);
}
