import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const historyPath = path.resolve(__dirname, "../site/data/history.json");

const SYMBOLS = ["USD", "CNY", "HKD", "EUR", "GBP", "JPY", "AUD", "CAD", "SGD", "CHF"];
const KEEP_DAYS = 450;
const BOOTSTRAP_DAYS = 400;

function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

function fromIsoDate(isoDate) {
  return new Date(`${isoDate}T00:00:00Z`);
}

function getTodayUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function shiftDays(date, diffDays) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + diffDays);
  return next;
}

function normalizeUsdRates(rawRates) {
  const normalized = { USD: 1 };

  for (const symbol of SYMBOLS) {
    if (symbol === "USD") {
      normalized.USD = 1;
      continue;
    }

    const value = rawRates[symbol];
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      return null;
    }
    normalized[symbol] = value;
  }

  return normalized;
}

async function readHistory() {
  try {
    const raw = await fs.readFile(historyPath, "utf-8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.records)) {
      return { schemaVersion: 1, base: "USD", symbols: SYMBOLS, updatedAt: null, records: [] };
    }
    return parsed;
  } catch {
    return { schemaVersion: 1, base: "USD", symbols: SYMBOLS, updatedAt: null, records: [] };
  }
}

async function writeHistory(history) {
  const payload = JSON.stringify(history, null, 2);
  await fs.writeFile(historyPath, `${payload}\n`, "utf-8");
}

async function fetchLatestUsdRates() {
  const apiKey = process.env.EXCHANGE_RATE_API_KEY;

  if (apiKey) {
    const url = `https://v6.exchangerate-api.com/v6/${apiKey}/latest/USD`;
    const response = await fetch(url);
    if (response.ok) {
      const json = await response.json();
      if (json && json.result === "success" && json.conversion_rates) {
        const normalized = normalizeUsdRates(json.conversion_rates);
        if (normalized) {
          return { source: "ExchangeRate-API", rates: normalized };
        }
      }
    }
  }

  const openResponse = await fetch("https://open.er-api.com/v6/latest/USD");
  if (openResponse.ok) {
    const openJson = await openResponse.json();
    if (openJson && openJson.result === "success" && openJson.rates) {
      const normalized = normalizeUsdRates(openJson.rates);
      if (normalized) {
        return { source: "open.er-api.com", rates: normalized };
      }
    }
  }

  const fallbackResponse = await fetch(`https://api.frankfurter.app/latest?from=USD&to=${SYMBOLS.filter((s) => s !== "USD").join(",")}`);
  if (fallbackResponse.ok) {
    const fallbackJson = await fallbackResponse.json();
    if (fallbackJson && fallbackJson.rates) {
      const normalized = normalizeUsdRates(fallbackJson.rates);
      if (normalized) {
        return { source: "Frankfurter", rates: normalized };
      }
    }
  }

  throw new Error("Unable to fetch latest rates from all configured free sources.");
}

async function fetchFrankfurterUsdRange(startDateIso, endDateIso) {
  if (!startDateIso || !endDateIso || startDateIso > endDateIso) {
    return [];
  }

  const symbolsWithoutUsd = SYMBOLS.filter((s) => s !== "USD");
  const records = [];

  // Frankfurter may downsample to weekly points for long ranges, so we fetch in chunks.
  let cursor = fromIsoDate(startDateIso);
  const hardEnd = fromIsoDate(endDateIso);

  while (cursor <= hardEnd) {
    const chunkStart = toIsoDate(cursor);
    const rawChunkEnd = shiftDays(cursor, 34);
    const chunkEndDate = rawChunkEnd > hardEnd ? hardEnd : rawChunkEnd;
    const chunkEnd = toIsoDate(chunkEndDate);
    const url = `https://api.frankfurter.app/${chunkStart}..${chunkEnd}?from=USD&to=${symbolsWithoutUsd.join(",")}&interval=1`;

    const response = await fetch(url);
    if (response.ok) {
      const json = await response.json();
      if (json && typeof json.rates === "object" && json.rates) {
        for (const [date, rates] of Object.entries(json.rates)) {
          const normalized = normalizeUsdRates(rates);
          if (!normalized) {
            continue;
          }
          records.push({ date, rates: normalized });
        }
      }
    }

    cursor = shiftDays(chunkEndDate, 1);
  }

  records.sort((a, b) => a.date.localeCompare(b.date));
  return records;
}

async function bootstrapHistoryIfNeeded(existingRecords) {
  if (existingRecords.length >= 180) {
    return existingRecords;
  }

  const today = getTodayUtc();
  const start = toIsoDate(shiftDays(today, -BOOTSTRAP_DAYS));
  const endDate = toIsoDate(today);
  const records = await fetchFrankfurterUsdRange(start, endDate);

  if (records.length === 0) {
    return existingRecords;
  }

  return dedupeSortPruneRecords([...existingRecords, ...records]);
}

async function backfillMissingRecords(existingRecords) {
  if (existingRecords.length === 0) {
    return existingRecords;
  }

  const sorted = [...existingRecords].sort((a, b) => a.date.localeCompare(b.date));
  const lastDate = sorted[sorted.length - 1]?.date;
  if (!lastDate) {
    return existingRecords;
  }

  const todayDate = toIsoDate(getTodayUtc());
  if (lastDate >= todayDate) {
    return existingRecords;
  }

  const startDate = toIsoDate(shiftDays(fromIsoDate(lastDate), 1));
  const missingRecords = await fetchFrankfurterUsdRange(startDate, todayDate);
  if (missingRecords.length === 0) {
    return existingRecords;
  }

  return dedupeSortPruneRecords([...existingRecords, ...missingRecords]);
}

function dedupeSortPruneRecords(records) {
  const uniqueByDate = new Map();
  for (const record of records) {
    if (!record || typeof record.date !== "string" || typeof record.rates !== "object" || !record.rates) {
      continue;
    }

    const normalized = normalizeUsdRates(record.rates);
    if (!normalized) {
      continue;
    }

    uniqueByDate.set(record.date, { date: record.date, rates: normalized });
  }

  const sorted = Array.from(uniqueByDate.values()).sort((a, b) => a.date.localeCompare(b.date));
  const cutoffDate = toIsoDate(shiftDays(getTodayUtc(), -KEEP_DAYS));
  return sorted.filter((record) => record.date >= cutoffDate);
}

async function main() {
  const history = await readHistory();
  const existingRecords = dedupeSortPruneRecords(Array.isArray(history.records) ? history.records : []);
  const bootstrapped = await bootstrapHistoryIfNeeded(existingRecords);
  const backfilled = await backfillMissingRecords(bootstrapped);

  const latest = await fetchLatestUsdRates();
  const todayDate = toIsoDate(getTodayUtc());

  const merged = [...backfilled.filter((r) => r.date !== todayDate), { date: todayDate, rates: latest.rates }];
  const finalRecords = dedupeSortPruneRecords(merged);

  const finalHistory = {
    schemaVersion: 1,
    base: "USD",
    symbols: SYMBOLS,
    updatedAt: new Date().toISOString(),
    latestSource: latest.source,
    records: finalRecords
  };

  await writeHistory(finalHistory);

  const firstDate = finalRecords.length > 0 ? finalRecords[0].date : "N/A";
  const lastDate = finalRecords.length > 0 ? finalRecords[finalRecords.length - 1].date : "N/A";
  console.log(`Updated history.json with ${finalRecords.length} records (${firstDate} -> ${lastDate}), source=${latest.source}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
