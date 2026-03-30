const CURRENCIES = [
  { code: "CNY", name: "人民币 CNY" },
  { code: "HKD", name: "港元 HKD" },
  { code: "USD", name: "美元 USD" },
  { code: "EUR", name: "欧元 EUR" },
  { code: "GBP", name: "英镑 GBP" },
  { code: "JPY", name: "日元 JPY" },
  { code: "AUD", name: "澳元 AUD" },
  { code: "CAD", name: "加元 CAD" },
  { code: "SGD", name: "新加坡元 SGD" },
  { code: "CHF", name: "瑞郎 CHF" }
];

const BASE_CURRENCIES = ["CNY", "HKD", "USD"];

const WINDOW_CONFIG = [
  { key: "month", label: "优于本月时间", weight: 0.2 },
  { key: "quarter", label: "优于本季时间", weight: 0.25 },
  { key: "year", label: "优于本年时间", weight: 0.25 },
  { key: "rollingYear", label: "优于过去一年时间", weight: 0.3 }
];

const CORE_BOARD = [
  { label: "HKD/CNY", base: "HKD", quote: "CNY", unit: 1 },
  { label: "USD/CNY", base: "USD", quote: "CNY", unit: 1 },
  { label: "JPY/CNY", base: "JPY", quote: "CNY", unit: 100 },
  { label: "USD/HKD", base: "USD", quote: "HKD", unit: 1 },
  { label: "EUR/USD", base: "EUR", quote: "USD", unit: 1 }
];

const state = {
  history: null,
  base: "CNY",
  quote: "USD",
  mode: "buy",
  rangeDays: 30,
  chart: null
};

const el = {
  baseCurrency: document.getElementById("baseCurrency"),
  quoteCurrency: document.getElementById("quoteCurrency"),
  modeButtons: Array.from(document.querySelectorAll(".mode-btn")),
  modeDescription: document.getElementById("modeDescription"),
  pairTitle: document.getElementById("pairTitle"),
  pairSub: document.getElementById("pairSub"),
  pricePrimary: document.getElementById("pricePrimary"),
  priceSecondary: document.getElementById("priceSecondary"),
  indexScore: document.getElementById("indexScore"),
  indexStars: document.getElementById("indexStars"),
  yearPercentBig: document.getElementById("yearPercentBig"),
  percentileRows: document.getElementById("percentileRows"),
  realtimeBoardBody: document.getElementById("realtimeBoardBody"),
  chartCaption: document.getElementById("chartCaption"),
  rangeButtons: Array.from(document.querySelectorAll(".range-btn")),
  trendChart: document.getElementById("trendChart"),
  strategyText: document.getElementById("strategyText"),
  strategyBullets: document.getElementById("strategyBullets"),
  lastUpdated: document.getElementById("lastUpdated"),
  dataCoverage: document.getElementById("dataCoverage")
};

function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

function parseIsoDate(dateText) {
  return new Date(`${dateText}T00:00:00Z`);
}

function shiftDays(date, diffDays) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + diffDays);
  return next;
}

function round(value, digits = 4) {
  return Number(value.toFixed(digits));
}

function formatPercent(value) {
  if (value === null || Number.isNaN(value)) {
    return "--";
  }
  return `${value.toFixed(1)}%`;
}

function formatSignedPercent(value) {
  if (value === null || Number.isNaN(value)) {
    return "--";
  }
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function formatRate(value, digits = 4) {
  if (!Number.isFinite(value)) {
    return "--";
  }
  return value.toLocaleString("zh-CN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function getRate(record, symbol) {
  const value = record?.rates?.[symbol];
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return value;
}

function calcQuotePerBase(record, base, quote) {
  const basePerUsd = getRate(record, base);
  const quotePerUsd = getRate(record, quote);
  if (!basePerUsd || !quotePerUsd) {
    return null;
  }
  return quotePerUsd / basePerUsd;
}

function calcBasePerQuote(record, base, quote) {
  const basePerUsd = getRate(record, base);
  const quotePerUsd = getRate(record, quote);
  if (!basePerUsd || !quotePerUsd) {
    return null;
  }
  return basePerUsd / quotePerUsd;
}

function getRecords() {
  if (!state.history || !Array.isArray(state.history.records)) {
    return [];
  }
  return [...state.history.records].sort((a, b) => a.date.localeCompare(b.date));
}

function getWindowStarts(latestDateText) {
  const latestDate = parseIsoDate(latestDateText);
  const year = latestDate.getUTCFullYear();
  const month = latestDate.getUTCMonth();
  const quarterStartMonth = Math.floor(month / 3) * 3;

  return {
    month: toIsoDate(new Date(Date.UTC(year, month, 1))),
    quarter: toIsoDate(new Date(Date.UTC(year, quarterStartMonth, 1))),
    year: toIsoDate(new Date(Date.UTC(year, 0, 1))),
    rollingYear: toIsoDate(shiftDays(latestDate, -364))
  };
}

function computeBetterPercentile(values, currentValue, mode) {
  if (values.length === 0 || !Number.isFinite(currentValue)) {
    return null;
  }

  let betterCount = 0;
  for (const value of values) {
    if (mode === "buy") {
      if (currentValue <= value) {
        betterCount += 1;
      }
    } else if (currentValue >= value) {
      betterCount += 1;
    }
  }

  return (betterCount / values.length) * 100;
}

function scoreToStars(score) {
  if (score === null) {
    return "--";
  }
  const stars = Math.max(1, Math.min(5, Math.round(score / 20)));
  return `${"★".repeat(stars)}${"☆".repeat(5 - stars)}`;
}

function buildPairSeries(records, base, quote) {
  const series = [];
  for (const record of records) {
    const cost = calcBasePerQuote(record, base, quote);
    if (!cost) {
      continue;
    }

    series.push({
      date: record.date,
      cost,
      quotePerBase: calcQuotePerBase(record, base, quote)
    });
  }
  return series;
}

function getPercentileMetrics(series, latestDateText, mode) {
  const windows = getWindowStarts(latestDateText);
  const currentValue = series[series.length - 1]?.cost;
  const metrics = {};

  for (const config of WINDOW_CONFIG) {
    const subset = series.filter((item) => item.date >= windows[config.key]);
    const values = subset.map((item) => item.cost);
    metrics[config.key] = computeBetterPercentile(values, currentValue, mode);
  }

  return metrics;
}

function computeCompositeScore(metrics) {
  let weighted = 0;
  let totalWeight = 0;

  for (const config of WINDOW_CONFIG) {
    const value = metrics[config.key];
    if (value === null) {
      continue;
    }
    weighted += value * config.weight;
    totalWeight += config.weight;
  }

  if (totalWeight === 0) {
    return null;
  }

  return weighted / totalWeight;
}

function renderPercentileRows(metrics) {
  el.percentileRows.innerHTML = "";

  for (const config of WINDOW_CONFIG) {
    const value = metrics[config.key];
    const valueText = formatPercent(value);
    const width = value === null ? 0 : Math.max(0, Math.min(100, value));

    const row = document.createElement("div");
    row.className = "percentile-row";
    row.innerHTML = `
      <div class="percentile-label">${config.label}</div>
      <div class="percent-bar"><span style="width:${width}%"></span></div>
      <div class="percentile-value">${valueText}</div>
    `;
    el.percentileRows.appendChild(row);
  }
}

function renderCoreBoard(records) {
  const latest = records[records.length - 1];
  const previous = records.length > 1 ? records[records.length - 2] : null;

  el.realtimeBoardBody.innerHTML = "";

  for (const pair of CORE_BOARD) {
    const latestUnitValue = calcQuotePerBase(latest, pair.base, pair.quote);
    const previousUnitValue = previous ? calcQuotePerBase(previous, pair.base, pair.quote) : null;

    const latestValue = latestUnitValue ? latestUnitValue * pair.unit : null;
    const previousValue = previousUnitValue ? previousUnitValue * pair.unit : null;

    let changePct = null;
    if (latestValue && previousValue) {
      changePct = ((latestValue - previousValue) / previousValue) * 100;
    }

    const row = document.createElement("tr");
    const latestText = pair.unit === 1
      ? `1 ${pair.base} = ${formatRate(latestValue, 4)} ${pair.quote}`
      : `${pair.unit} ${pair.base} = ${formatRate(latestValue, 4)} ${pair.quote}`;

    let changeClass = "change-flat";
    if (changePct !== null && changePct > 0.00001) {
      changeClass = "change-up";
    } else if (changePct !== null && changePct < -0.00001) {
      changeClass = "change-down";
    }

    row.innerHTML = `
      <td>${pair.label}</td>
      <td>${latestText}</td>
      <td class="${changeClass}">${formatSignedPercent(changePct)}</td>
    `;

    el.realtimeBoardBody.appendChild(row);
  }
}

function buildStrategy(score, mode, base, quote) {
  if (score === null) {
    return {
      title: "历史数据不足，暂时只展示实时价格",
      bullets: [
        "先累积更多交易日数据，分位数会自动稳定。",
        "目前可先用日变化和近30天走势做短期参考。"
      ]
    };
  }

  const directionText = mode === "buy"
    ? `用 ${base} 买 ${quote}`
    : `把 ${quote} 换回 ${base}`;

  if (score >= 85) {
    return {
      title: `当前${directionText}处于高胜率窗口（指数 ${score.toFixed(1)}）`,
      bullets: [
        "可考虑分2-3笔执行，降低单点误差。",
        "如为买入模式，优先安排刚需支出；如为换回模式，可适当提高结汇比例。",
        "设定目标价和止盈线，避免因短线波动错失窗口。"
      ]
    };
  }

  if (score >= 65) {
    return {
      title: `当前${directionText}偏划算（指数 ${score.toFixed(1)}）`,
      bullets: [
        "可以小额试探，观察后续1-3日确认趋势。",
        "若有手续费差异，优先选择点差更低的平台或渠道。",
        "保留部分仓位，防止后续出现更优价格。"
      ]
    };
  }

  if (score >= 40) {
    return {
      title: `当前${directionText}处于中性区域（指数 ${score.toFixed(1)}）`,
      bullets: [
        "建议按刚需分批执行，不追求一次性全仓。",
        "结合支付方式优化成本，例如返现卡或免手续费通道。",
        "重点关注未来一周事件窗口（利率、就业、通胀）。"
      ]
    };
  }

  return {
    title: `当前${directionText}性价比较低（指数 ${score.toFixed(1)}）`,
    bullets: [
      "若非刚需，优先等待更优区间。",
      "若必须执行，采用更细分批（如4-6笔）控制平均成本。",
      "使用替代方案平滑损失，例如消费返现、延后结算或对冲安排。"
    ]
  };
}

function renderStrategy(score) {
  const data = buildStrategy(score, state.mode, state.base, state.quote);
  el.strategyText.textContent = data.title;
  el.strategyBullets.innerHTML = "";

  for (const item of data.bullets) {
    const li = document.createElement("li");
    li.textContent = item;
    el.strategyBullets.appendChild(li);
  }
}

function renderChart(series) {
  const maxPoints = state.rangeDays;
  const sliced = series.slice(-maxPoints);
  const labels = sliced.map((item) => item.date.slice(5));
  const values = sliced.map((item) => round(item.cost, 6));
  const current = values.length > 0 ? values[values.length - 1] : null;
  const levelLine = values.map(() => current);

  el.chartCaption.textContent = state.mode === "buy"
    ? `图中价格为 1 ${state.quote} 需要多少 ${state.base}（越低越好）`
    : `图中价格为 1 ${state.quote} 可换回多少 ${state.base}（越高越好）`;

  if (!window.Chart) {
    return;
  }

  if (state.chart) {
    state.chart.destroy();
  }

  state.chart = new window.Chart(el.trendChart.getContext("2d"), {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "历史曲线",
          data: values,
          borderColor: "#0f8b7f",
          backgroundColor: "rgba(15, 139, 127, 0.15)",
          tension: 0.22,
          pointRadius: 0,
          borderWidth: 2,
          fill: true
        },
        {
          label: "当前水位",
          data: levelLine,
          borderColor: "#f29d52",
          borderDash: [6, 6],
          pointRadius: 0,
          borderWidth: 1.6,
          fill: false
        }
      ]
    },
    options: {
      maintainAspectRatio: false,
      events: ["mousemove", "mouseout", "click", "touchstart", "touchend"],
      interaction: {
        mode: "index",
        intersect: false
      },
      plugins: {
        legend: {
          display: true,
          labels: {
            boxWidth: 14,
            color: "#35544d"
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color: "#496259",
            maxTicksLimit: state.rangeDays === 30 ? 8 : 10
          },
          grid: {
            color: "rgba(34, 58, 45, 0.08)"
          }
        },
        y: {
          ticks: {
            color: "#496259"
          },
          grid: {
            color: "rgba(34, 58, 45, 0.08)"
          }
        }
      }
    }
  });
}

function renderOverview(records, series, metrics, score) {
  const latestRecord = records[records.length - 1];
  const latestCost = series[series.length - 1]?.cost;
  const latestQuotePerBase = series[series.length - 1]?.quotePerBase;

  el.pairTitle.textContent = `当前组合：${state.base} / ${state.quote}`;
  el.pairSub.textContent = state.mode === "buy"
    ? "你在买入目标货币，越便宜越好"
    : "你在把目标货币换回，越贵越好";

  el.pricePrimary.textContent = state.mode === "buy"
    ? `1 ${state.quote} ≈ ${formatRate(latestCost, 4)} ${state.base}`
    : `1 ${state.quote} ≈ ${formatRate(latestCost, 4)} ${state.base}`;

  el.priceSecondary.textContent = `1 ${state.base} ≈ ${formatRate(latestQuotePerBase, 4)} ${state.quote}`;

  el.indexScore.textContent = score === null ? "--" : `${score.toFixed(1)} / 100`;
  el.indexStars.textContent = scoreToStars(score);
  el.yearPercentBig.textContent = formatPercent(metrics.year);

  el.modeDescription.textContent = state.mode === "buy"
    ? `当前模式：你在用 ${state.base} 买入 ${state.quote}。分位数越高，说明当前买入成本越接近历史低位。`
    : `当前模式：你在把 ${state.quote} 换回 ${state.base}。分位数越高，说明当前换回收益越接近历史高位。`;

  const latestDate = latestRecord?.date || "--";
  const firstDate = records[0]?.date || "--";

  el.lastUpdated.textContent = state.history?.updatedAt
    ? `数据更新时间：${new Date(state.history.updatedAt).toLocaleString("zh-CN", { hour12: false })}`
    : "数据更新时间：--";
  el.dataCoverage.textContent = `历史覆盖：${firstDate} 至 ${latestDate}（${records.length} 条）`;
}

function buildQuoteOptions() {
  el.quoteCurrency.innerHTML = "";
  for (const item of CURRENCIES) {
    if (item.code === state.base) {
      continue;
    }

    const option = document.createElement("option");
    option.value = item.code;
    option.textContent = item.name;
    if (item.code === state.quote) {
      option.selected = true;
    }
    el.quoteCurrency.appendChild(option);
  }

  if (state.base === state.quote) {
    const first = CURRENCIES.find((item) => item.code !== state.base);
    state.quote = first ? first.code : "USD";
    el.quoteCurrency.value = state.quote;
  }
}

function buildBaseOptions() {
  el.baseCurrency.innerHTML = "";
  for (const code of BASE_CURRENCIES) {
    const item = CURRENCIES.find((entry) => entry.code === code);
    if (!item) {
      continue;
    }

    const option = document.createElement("option");
    option.value = item.code;
    option.textContent = item.name;
    if (item.code === state.base) {
      option.selected = true;
    }
    el.baseCurrency.appendChild(option);
  }
}

function setActiveButtons() {
  for (const button of el.modeButtons) {
    button.classList.toggle("active", button.dataset.mode === state.mode);
  }

  for (const button of el.rangeButtons) {
    button.classList.toggle("active", Number(button.dataset.range) === state.rangeDays);
  }
}

function renderAll() {
  const records = getRecords();
  if (records.length === 0) {
    el.modeDescription.textContent = "暂无历史数据，请先执行汇率抓取任务。";
    return;
  }

  const series = buildPairSeries(records, state.base, state.quote);
  if (series.length === 0) {
    el.modeDescription.textContent = "所选货币组合缺少数据，请切换币种后重试。";
    return;
  }

  const latestDate = series[series.length - 1].date;
  const metrics = getPercentileMetrics(series, latestDate, state.mode);
  const score = computeCompositeScore(metrics);

  renderOverview(records, series, metrics, score);
  renderPercentileRows(metrics);
  renderCoreBoard(records);
  renderChart(series);
  renderStrategy(score);
  setActiveButtons();
}

async function loadHistory() {
  const response = await fetch(`./data/history.json?t=${Date.now()}`);
  if (!response.ok) {
    throw new Error(`Failed to load history.json (${response.status})`);
  }

  return response.json();
}

function bindEvents() {
  el.baseCurrency.addEventListener("change", (event) => {
    state.base = event.target.value;
    if (state.base === state.quote) {
      const fallback = CURRENCIES.find((item) => item.code !== state.base);
      state.quote = fallback ? fallback.code : "USD";
    }
    buildQuoteOptions();
    renderAll();
  });

  el.quoteCurrency.addEventListener("change", (event) => {
    state.quote = event.target.value;
    renderAll();
  });

  for (const button of el.modeButtons) {
    button.addEventListener("click", () => {
      state.mode = button.dataset.mode === "sell" ? "sell" : "buy";
      renderAll();
    });
  }

  for (const button of el.rangeButtons) {
    button.addEventListener("click", () => {
      state.rangeDays = Number(button.dataset.range) === 365 ? 365 : 30;
      renderAll();
    });
  }
}

async function init() {
  try {
    state.history = await loadHistory();
    buildBaseOptions();
    buildQuoteOptions();
    bindEvents();
    renderAll();
  } catch (error) {
    el.modeDescription.textContent = `数据加载失败：${error.message}`;
  }
}

init();
