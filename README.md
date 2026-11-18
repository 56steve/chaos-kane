# chaos-kane

An AI agent builds a checkout and says it handles API failures. **Kane CLI breaks the API and shows what the shopper was really told.** The harness then compares that with what the backend actually did.

Built for the Kane CLI Online Hackathon by TestMu AI, with Claude Code as the coding agent.

## What it found

| Run | Checkout version | Result |
|---|---|---|
| Baseline, 6 injected failures | first version an agent wrote ("errors handled") | survived 1 of 6. On 4 failures the page said "Order placed!" and no order existed. On 1 it hung with no error. |
| After one repair from Kane's evidence | honest errors, 8 second timeout | survived 6 of 6 |
| New "ghost" failure (the response is lost after the order is saved) | the repaired version | Kane caught a **duplicate order**: a retry created a second order and the page still said success |
| After the idempotency fix | client reuses one key per attempt, server dedupes | survived, exactly one order |

Evidence is committed in `reports/`: `baseline.*`, `after.*`, `ghost-before/` and `ghost-after/`, each with the raw Kane NDJSON of the runs behind it.

## Key design decision: Kane observes, the harness judges

In the first spike Kane was asked to pass or fail a fake-success checkout and it **passed it** (see [docs/spike-findings.md](docs/spike-findings.md)). Told to extract the page text and the HTTP status of the order request, it reported both correctly. So Kane is the observer in a real browser, and `harness/verdict.js` decides from three facts:

1. what the shopper saw on the page
2. what the order request returned
3. how many orders the backend really stored

A missing observation counts as `incomplete`, never as a pass.

## How it works

```
proxy injects one API fault  ->  Kane places an order in Chrome and records
page text + HTTP status  ->  harness compares with the backend's real orders
->  agent patches the app from the evidence  ->  Kane runs everything again
```

Faults (`chaos/proxy.js`): `error500`, `slow` (6s), `timeout`, `garbage` (HTML with 200), `empty` (200 with no body), `reset` (dropped connection), `ghost` (first response lost after the backend saved the order, which only matters if the shopper retries).

Kane has three roles here:
- **Observer**: runs the real checkout in Chrome with `--agent`, parsing the NDJSON `run_end` record.
- **Evidence for the agent**: failing evidence is what the coding agent reads to fix the app.
- **Gate**: a Claude Code Stop hook runs Kane before the agent is allowed to finish.

## Run it

Needs Node 18+, Google Chrome, and a Kane CLI account with credits (a run costs roughly 15 to 30 credits).

```bash
npm install -g @testmuai/kane-cli
kane-cli login

npm test                                  # unit tests, no Kane needed
npm run smoke                             # proxy and backend checks, no Kane needed
npm run chaos                             # all scenarios through Kane, writes reports/latest.html
npm run chaos -- --only=error500,ghost    # a subset
npm run chaos -- --repeat=3               # each scenario 3 times, majority verdict plus agreement
npm start                                 # the shop on :4100 (through the proxy) to try by hand
```

Exit code is 0 when every failure is survived, 1 when one is not, 2 when Kane gave no usable result.

## The stop gate

`.claude/settings.json` registers `hooks/stop-gate.js` as a Claude Code Stop hook. When the agent tries to finish and the code in `app/` or `chaos/` changed since the last verified pass, it runs Kane on `none`, `error500` and `ghost`. A failure exits with code 2, which blocks the stop and feeds Kane's evidence back to the agent. The message tells the agent to fix `app/` and never the checker.

- Gives up after 3 blocked stops per session (`CHAOS_GATE_MAX`) so the agent is never trapped.
- Fails open if the gate itself cannot run (Kane missing, port in use).
- `CHAOS_GATE=off` disables it, `CHAOS_GATE_SCENARIOS=a,b` changes what it checks.

`npm run repair` is an optional unattended version of the same loop that calls the `claude` CLI as the repair agent and undoes any edit outside `app/client.js`. It needs that CLI to be signed in.

## Layout

```
app/        demo shop (page, client, backend with idempotency)
chaos/      fault injecting proxy
harness/    Kane runner, verdict judge, repeat aggregation, gate logic, report
hooks/      Claude Code Stop hook
reports/    committed evidence from real Kane runs
docs/       spike findings
```

## Limits

- One small checkout flow, not a real application.
- The verdict reads the page text with patterns for success and error wording, so a very unusual message could be misread.
- Kane is an AI agent, so a run can occasionally give a different observation. `--repeat` measures that.
- Faults are injected between the browser and the app, so this tests how the page behaves, not the backend's own resilience.
