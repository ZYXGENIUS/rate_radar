import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const historyPath = path.resolve(__dirname, "../site/data/history.json");

const REQUIRED_SYMBOLS = ["USD", "CNY", "HKD", "EUR", "GBP", "JPY", "AUD", "CAD", "SGD", "CHF"];

function fail(message) {
  throw new Error(`history.json validation failed: ${message}`);
}

async function main() {
  const raw = await fs.readFile(historyPath, "utf-8");
  const data = JSON.parse(raw);

  if (!Array.isArray(data.records)) {
    fail("records must be an array");
  }

  let previousDate = "0000-00-00";
  for (const record of data.records) {
    if (typeof record.date !== "string") {
      fail("record.date must be a string");
    }

    if (record.date < previousDate) {
      fail("records must be sorted by date ascending");
    }
    previousDate = record.date;

    if (!record.rates || typeof record.rates !== "object") {
      fail(`record ${record.date} is missing rates`);
    }

    for (const symbol of REQUIRED_SYMBOLS) {
      const value = record.rates[symbol];
      if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
        fail(`record ${record.date} has invalid rate for ${symbol}`);
      }
    }
  }

  console.log(`history.json is valid with ${data.records.length} records`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
