# RateRadar

RateRadar 是一个零成本汇率决策仪表盘：

- 支持基准货币：人民币 CNY、港元 HKD、美元 USD。
- 支持方向切换：
  - 用基准货币买目标货币（买入）
  - 把目标货币换回基准货币（换回）
- 支持四大分位数：优于本月 / 本季 / 本年 / 过去一年。
- 支持核心货币对看板与 30/365 天走势。
- 支持 GitHub Actions 每日自动更新历史数据。
- 支持 GitHub Pages 免费托管。

## 1) 目录结构

```text
site/
  index.html
  assets/
    app.js
    style.css
  data/
    history.json
scripts/
  fetch_rates.mjs
  validate_history.mjs
.github/workflows/
  update-rates.yml
  deploy-pages.yml
docker-compose.yml
```

## 2) 在 Docker 中运行（本地）

### 2.1 首次准备

```bash
cp .env.example .env
# 可选：在 .env 写入 EXCHANGE_RATE_API_KEY；不写也可用公开源
```

### 2.2 推荐启动方式（每次打开都可用）

```bash
docker compose run --rm updater
docker compose up -d web
```

或一条命令：

```bash
npm run docker:start
```

### 2.3 仅启动网页（不更新数据）

```bash
docker compose up -d web
```

浏览器打开：

```text
http://localhost:8080
```

### 2.4 停止服务

```bash
docker compose down
```

### 2.5 隔很多天再打开会不会自动补全

- 只启动 `web` 不会补数据（它只是静态网页服务）。
- 运行一次 `updater` 会自动补齐上次记录之后缺失的交易日，再写入今天的数据。
- 因此，建议每次打开前执行：

```bash
docker compose run --rm updater
```

这样可以保证分位数（本月/本季/本年/过去一年）一直准确。

## 3) 数据存储策略

- 所有历史汇率存储在 `site/data/history.json`（仓库内 JSON 文件）。
- 每次更新时会自动补齐断更期间缺失的交易日数据（如果存在）。
- 每次抓取后自动裁剪，只保留最近约 450 天数据，避免文件无限增长。
- 这样既能计算本月/本季/本年/过去一年分位数，也能保持仓库轻量。

## 4) GitHub 自动化说明

### 4.1 每日更新历史数据

工作流：`.github/workflows/update-rates.yml`

- 每天定时运行（UTC 01:05）。
- 执行 `scripts/fetch_rates.mjs` 更新历史。
- 若 `history.json` 有变化则自动提交回主分支。
- 同一工作流内自动执行 Pages 部署，线上页面会同步刷新到最新数据。

### 4.2 自动部署页面

工作流：`.github/workflows/deploy-pages.yml`

- 当你手动修改代码并推送到主分支时，自动部署 `site/` 到 GitHub Pages。

## 5) 移植到 GitHub（一步步）

1. 在 GitHub 新建仓库，例如 `rate_radar`。
2. 本地初始化并推送：

```bash
git init
git add .
git commit -m "feat: init RateRadar"
git branch -M main
git remote add origin <你的仓库地址>
git push -u origin main
```

3. 在仓库设置中开启 Pages：
   - `Settings` -> `Pages` -> `Build and deployment` 选择 `GitHub Actions`。
4. 在仓库设置中添加密钥（可选但推荐）：
   - `Settings` -> `Secrets and variables` -> `Actions` -> `New repository secret`
   - 名称：`EXCHANGE_RATE_API_KEY`
5. 在 `Actions` 页面手动执行一次 `Update FX History`，确认 `site/data/history.json` 已更新。
6. 等待同一工作流执行完部署步骤，拿到线上地址；如果只是改了页面代码，也可依赖 `Deploy GitHub Pages` 工作流自动发布。

## 6) API 源策略

抓取脚本按顺序尝试：

1. `ExchangeRate-API`（当提供 `EXCHANGE_RATE_API_KEY`）
2. `open.er-api.com`（无需 key）
3. `Frankfurter`（无需 key，作为兜底）

首次无数据时，会使用 Frankfurter 拉取过去约 400 天历史进行冷启动。
