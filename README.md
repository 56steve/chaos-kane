# chaos-kane

![chaos-kane: result of the last recorded run](docs/badge.svg)

An AI agent builds a checkout and says it handles API failures. **chaos-kane breaks the API with Kane CLI and shows what the user was really told, next to what the backend really did.**

## What it found

Run against a small demo shop (one checkout flow), with the real backend order list as ground truth:

| Run | Result |
|---|---|
| First checkout an agent wrote ("errors handled") | survived **1 of 7** injected failures. On 4 of them the page said "Order placed!" and no order existed; on 1 it hung with no error; on 1 a retry created a **duplicate order** while the page still said success. |
| After one fix from Kane's evidence | survived **7 of 7**, and the same 7 of 7 on three repeated runs of every scenario |
| Double click on the old checkout | 2 orders from one click pair, on all 3 runs |
| Double click on the fixed checkout | 1 order, on all 3 runs |

The evidence is committed in [reports/](reports/): `replay-before/` and `replay-after/` (the full before and after runs), `stability/` (3 runs per scenario), the `validate-*` runs, and the raw Kane output behind them.

## On an app we did not write

[Conduit](https://github.com/TonyMckes/conduit-realworld-example-app) is the RealWorld reference app (React and Express). The flow logs in and publishes an article. Nothing was configured except the flow: the baseline run showed chaos-kane which request to break, so the login was left alone.

| Run | Result |
|---|---|
| Unmodified Conduit | survived **0 of 5** injected failures. A 500 left a **blank page**. A garbage, empty or dropped reply landed the user on a **"404 Not Found"** page, with nothing saved. |
| After a small fix to its error handling ([diff](reports/third-party/conduit-fix.diff)) | survived **4 of 5**. The user now sees "Something went wrong", "The server sent an unexpected reply" or "Could not reach the server". |
| Still failing | a reply lost after the article was saved: the user is told it failed, but the article exists. |

Evidence and screenshots: [before](reports/third-party/conduit-before/) and [after](reports/third-party/conduit-after/).

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

Kane has three roles: **observer** (real Chrome, NDJSON output), **evidence for the agent** (the failing evidence is what the coding agent reads), and **gate** (a stop hook runs Kane before the agent may finish).

## Check your setup

`node bin/chaos-kane.js doctor` (or `npm run doctor`) checks everything a run needs and prints the exact fix for anything missing. It changes nothing and costs no credits. Add `--app <url>` and `--truth-url <url>` to also confirm your app answers and the truth endpoint returns something countable, and `--json` for machine-readable output. Agents get the same check as the `chaos_doctor` MCP tool.

## Check the verdicts yourself

Every saved report holds the evidence behind each verdict: what the user saw, the status of the write request, and what the backend really stored. `npm run audit -- reports/replay-before` recomputes each verdict from that evidence alone and compares it with the recorded one. It needs no Kane, no credits and no network, so anyone can confirm that the verdicts follow from the evidence and were not edited. It exits 1 if any verdict differs. The unit tests run it over every committed report. Results marked *unable to verify* depend on live checks (the fault fired, the network log agreed with Kane), so the audit skips them and shows why.

## Use it on your own app

```bash
node bin/chaos-kane.js \
  --app http://localhost:3000 \
  --flow "Add an item to the cart and place the order" \
  --truth-url http://localhost:3000/api/orders \
  --noun order \
  --agent-claim "the checkout handles API failures"
```

- `--truth-url` returns JSON listing or counting what the backend stored. If the list is paginated, the total it reports (`total`, `totalCount`, `articlesCount`, ...) is used; a list without a total is counted by its length, so give it a URL that returns everything (for example `?limit=1000`). With it, duplicates are detected. Without it, the proxy's count of accepted writes is the evidence and duplicate detection is off.
- `--agent-claim` states what the agent claimed; the report says whether the evidence **supports**, **does not support**, or **can't verify** it.
- `--dry-run` prints what would run (scenarios, number of Kane runs, estimated credits) and stops: no browser, no credits.
- **What gets broken is learned.** The baseline run (`none`) records the writes the flow made, and every fault then hits only the last write that succeeded, the one the flow ends on. A login or other setup request is left alone, so a flow with a sign-in works without configuration. Pass `--fault-paths` or `--fault-methods` to choose yourself.
- `--max-steps <n>` raises Kane's step budget (default 15) for flows with a login or a long form.
- `--claims "<regex>"` sets what counts as a success message. It is also matched against the page the flow ended on, for apps that show success by moving to a new page (for example `--claims "/article/"`); `--faults a,b`, `--repeat 3` tune the run. HTTPS upstreams are supported.
- `--baseline reports/earlier/latest.json` compares with an earlier run and fails only on **new** failures.
- Outputs in the report folder: `latest.html`, `summary.md` (also appended to the GitHub Actions job summary), and `fix-brief.md` for any coding agent when something did not survive.
- Exit code: 0 all survived, 1 a failure was found, 2 no usable result.

## For coding agents

- **MCP tool:** add `bin/chaos-kane-mcp.js` to any MCP client as a stdio server (command `node`, argument `bin/chaos-kane-mcp.js`). It exposes `chaos_check` (runs the check, returns the evidence and a fix brief), `chaos_scenarios` and `chaos_doctor`.
- **Fix brief:** `fix-brief.md` is plain Markdown any agent can read: the evidence, what a correct fix looks like, and what must not be touched.
- **Stop gate:** register `hooks/stop-gate.js` as a stop hook in your agent's settings. When the agent tries to finish and the code in `app/` or `chaos/` changed since the last verified pass, Kane runs `none`, `error500` and `ghost`; a failure exits 2, which blocks the stop and feeds the evidence back. It gives up after 3 blocked stops per session and lets the stop through if the gate itself cannot run.

## CI

`docs/ci-example.yml` is a GitHub Actions workflow template. It needs your own Kane credentials as repository secrets.

## Live dashboard

`npm run live` starts the demo run with a live dashboard on `http://127.0.0.1:4200`: a small diagram of the request path (browser, proxy, backend) shows where each failure cut the request, with what the page said under the browser and what the backend saved under the backend. The dashboard also shows Kane's screenshot of the page. In the replay, the same scenario from the before and the after run is shown side by side (the page saying "Order placed!" next to the page saying "We couldn't place your order"), and the fix itself is shown as a colored diff between the two runs. The replay walks through Break, Observe, Diagnose, Fix and Verify at a readable pace, pausing on a short diagnosis of what failed and why, with Pause and speed controls. `npm run replay -- before=reports/replay-before after=reports/replay-after patch=app/client.js` builds a static replay of the recorded before and after runs, with their screenshots, into `docs/` for static hosting.

## Run it

Needs Node 22+, Google Chrome, and a Kane CLI account with credits (a run costs roughly 15 to 30 credits).

```bash
npm install -g @testmuai/kane-cli
kane-cli login
npm run doctor   # checks Node, Chrome, Kane login and credits, ports; says how to fix anything missing

npm test         # unit tests, no Kane needed
npm run smoke    # proxy and backend checks, no Kane needed
npm run chaos    # the demo shop through Kane, writes reports/latest.html
npm run live     # the same run with the live dashboard
npm run badge    # a status badge (docs/badge.svg) from the last recorded run
node bin/chaos-kane.js --help
```

## Layout

```
app/        demo shop (page, client, backend with idempotency)
chaos/      fault injecting proxy (http and https upstream)
harness/    Kane runner, verdicts, claim and baseline comparison, summary, fix brief, MCP, live dashboard
bin/        chaos-kane (CLI) and chaos-kane-mcp (MCP server)
hooks/      stop hook for coding agents
scripts/    smoke test, split-origin fixture, replay and report scrubbing
reports/    committed evidence from real Kane runs (paths and share links scrubbed)
docs/       spike findings, CI example
```

## License

MIT, see [LICENSE](LICENSE).
