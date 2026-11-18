# chaos-kane

An AI agent builds a checkout and says it handles API failures. **chaos-kane breaks the API with Kane CLI and shows what the user was really told, next to what the backend really did.**

Built for the Kane CLI Online Hackathon by TestMu AI, with Claude Code as the coding agent.

## What it found

Run against a small demo shop (one checkout flow), with the real backend order list as ground truth:

| Run | Result |
|---|---|
| First checkout an agent wrote ("errors handled") | survived **1 of 7** injected failures. On 4 of them the page said "Order placed!" and no order existed; on 1 it hung with no error; on 1 a retry created a **duplicate order** while the page still said success. |
| After one fix from Kane's evidence | survived **7 of 7**, and the same 7 of 7 on three repeated runs of every scenario |
| Double click on the old checkout | 2 orders from one click pair, on all 3 runs |
| Double click on the fixed checkout | 1 order, on all 3 runs |

The evidence is committed in [reports/](reports/): `replay-before/` and `replay-after/` (the full before and after runs), `stability/` (3 runs per scenario), the `validate-*` runs, and the raw Kane output behind them.

## Kane observes, the harness judges

In the first spike Kane was asked to pass or fail a fake-success checkout and it **passed it** ([docs/spike-findings.md](docs/spike-findings.md)). Told to extract the page text and the HTTP status of the write request, it reported both correctly. So Kane is the observer in a real browser, and [harness/verdict.js](harness/verdict.js) decides from three facts: what the user saw, what the request returned, and how many records the backend really stored.

Every result is one of **survived**, **failed**, or **unable to verify**. The status of the write request is cross-checked: Kane reports it, and the browser's own network log (from Kane's evidence pack) is the authoritative value. If they ever disagree the result is *unable to verify*. Each run also keeps Kane's final screenshot, so the page that said "Order placed!" can be seen next to the HTTP 500 and the empty order list. A run that produced no usable evidence (Kane returned nothing, the fault never hit a request, no write reached the proxy) is *unable to verify*, never a pass.

## How it works

```
proxy injects one API fault  ->  Kane does the user flow in Chrome and records
the page text + HTTP status  ->  harness compares with the backend's real state
->  agent fixes from the evidence  ->  Kane runs everything again
```

Faults (`chaos/proxy.js`): `error500`, `slow` (6s), `timeout`, `garbage` (HTML with 200), `empty` (200, no body), `reset` (dropped connection), `ghost` (the backend saves the change, the first reply is lost, the user retries), `double` (the reply is held 2s while the user double clicks).

Kane has three roles: **observer** (real Chrome, NDJSON output), **evidence for the agent** (the failing evidence is what the coding agent reads), and **gate** (a Claude Code Stop hook runs Kane before the agent may finish).

## Use it on your own app

```bash
node bin/chaos-kane.js \
  --app http://localhost:3000 \
  --flow "Add an item to the cart and place the order" \
  --truth-url http://localhost:3000/api/orders \
  --noun order \
  --agent-claim "the checkout handles API failures"
```

- `--truth-url` returns JSON listing or counting what the backend stored. With it, duplicates are detected. Without it, the proxy's count of accepted writes is the evidence and duplicate detection is off.
- `--agent-claim` states what the agent claimed; the report says whether the evidence **supports**, **does not support**, or **can't verify** it.
- `--claims "<regex>"` sets what counts as a success message; `--faults a,b`, `--repeat 3`, `--fault-paths`, `--fault-methods` tune the run. HTTPS upstreams are supported (the transport is unit tested; it has not been run against a real HTTPS site).
- `--baseline reports/earlier/latest.json` compares with an earlier run and fails only on **new** failures.
- Outputs in the report folder: `latest.html`, `summary.md` (also appended to the GitHub Actions job summary), and `fix-brief.md` for any coding agent when something did not survive.
- Exit code: 0 all survived, 1 a failure was found, 2 no usable result.

**Limit:** the proxy sits in front of the app URL, so it only sees API calls that go through it. If the frontend calls an API on another origin, those scenarios report *unable to verify* (a split-origin fixture in `scripts/` demonstrates it).

## For coding agents

- **MCP tool:** `claude mcp add chaos-kane -- node bin/chaos-kane-mcp.js` exposes `chaos_check` (runs the check, returns the evidence and a fix brief) and `chaos_scenarios`. Any MCP client can use it.
- **Fix brief:** `fix-brief.md` is plain Markdown any agent can read: the evidence, what a correct fix looks like, and what must not be touched.
- **Stop gate:** `.claude/settings.json` registers `hooks/stop-gate.js`. When the agent tries to finish and the code in `app/` or `chaos/` changed since the last verified pass, Kane runs `none`, `error500` and `ghost`; a failure exits 2, which blocks the stop and feeds the evidence back. It gives up after 3 blocked stops per session and lets the stop through if the gate itself cannot run.

## CI

`docs/ci-example.yml` is a GitHub Actions workflow template. It has **not been run** in this repository: it needs your own Kane credentials as repository secrets.

## Live dashboard

`npm run live` starts the demo run with a live dashboard on `http://127.0.0.1:4200`: a small diagram of the request path (browser, proxy, backend) shows where each failure cut the request, with what the page said under the browser and what the backend saved under the backend. The dashboard also shows Kane's screenshot of the page. `npm run replay -- before=reports/replay-before after=reports/replay-after` builds a static replay of the recorded before and after runs, with their screenshots, into `docs/` for static hosting.

## Run it

Needs Node 22+, Google Chrome, and a Kane CLI account with credits (a run costs roughly 15 to 30 credits).

```bash
npm install -g @testmuai/kane-cli
kane-cli login

npm test         # unit tests, no Kane needed
npm run smoke    # proxy and backend checks, no Kane needed
npm run chaos    # the demo shop through Kane, writes reports/latest.html
npm run live     # the same run with the live dashboard
node bin/chaos-kane.js --help
```

## Layout

```
app/        demo shop (page, client, backend with idempotency)
chaos/      fault injecting proxy (http and https upstream)
harness/    Kane runner, verdicts, claim and baseline comparison, summary, fix brief, MCP, live dashboard
bin/        chaos-kane (CLI) and chaos-kane-mcp (MCP server)
hooks/      Claude Code Stop hook
scripts/    smoke test, split-origin fixture, replay and report scrubbing
reports/    committed evidence from real Kane runs (paths and share links scrubbed)
docs/       spike findings, CI example
```

## Limits

- The demo is one small checkout flow; the tool has been exercised on that and on small fixtures, not on a third-party app.
- Screenshots come from Kane's evidence pack and need `unzip` on the machine; without it runs still work, with no screenshot and no network-log cross-check (the status then comes from Kane alone).
- The verdict reads the page text with wording patterns for success and error (`--claims` overrides them), so an unusual message could be misread.
- Kane is an AI agent and can occasionally observe differently between runs; `--repeat` measures it. The `double` scenario relies on Kane double clicking.
- The stop hook was tested by running it directly with a failing and a passing checkout, not yet inside a live Claude Code session.
- Saved Kane output is scrubbed of local paths and share links, but earlier git history was committed before the scrubber existed.
