# Evidence from real runs

Everything here was produced by real Kane runs, then scrubbed of local paths and share links (`node scripts/scrub-reports.js <folder>`). Each folder has `latest.json` (the results), `latest.html` (a readable report) and, where Kane saved them, screenshots under `evidence/`.

To check any folder without Kane, credits or a network, recompute its verdicts from the saved evidence:

```bash
npm run audit -- reports/replay-before
```

## The main results

| Folder | What it is | Result |
|---|---|---|
| `replay-before/`, `replay-after/` | the demo shop before and after one fix (this is what the replay site plays) | 1 of 7 survived, then 7 of 7 |
| `stability/` | every scenario on the fixed demo shop, 3 runs each | the same verdict on all 3 runs |
| `third-party/` | Conduit, the RealWorld reference app (not written here): `conduit-before/`, `conduit-after/` and the fix as `conduit-fix.diff` | 0 of 5 survived, then 4 of 5 |
| `ghost-before/`, `ghost-after/` | a reply lost after the save, then the user retries | a duplicate order, then none |

## Validation runs

Each one exercises a single feature of the checker, on the demo shop or a small fixture.

| Folder | What it checks |
|---|---|
| `validate-demo/` | the standard scenarios on the demo shop |
| `validate-evidence/` | screenshots and the cross-check against the browser's network log |
| `validate-claim/` | `--agent-claim`: does the evidence support what the agent said |
| `validate-double-naive/`, `validate-double-fixed/` | a double click on the naive and the fixed checkout (2 orders, then 1) |
| `validate-byo/`, `validate-byo-notruth/` | a second small app with and without a truth endpoint (fixed version) |
| `validate-byo-naive/`, `validate-byo-naive-notruth/` | the same second app, naive version (fake success and a duplicate are caught) |
| `validate-split/` | an app whose API is on another origin: the proxy cannot see it, the fault never fires, and the result is "unable to verify" |
| `mcp/` | an early `chaos_check` call through the MCP server against the naive checkout (the baseline survives, the 500 is caught as a fake success) |

## Earlier runs

`baseline.*`, `after.*`, `latest.*` and the `<scenario>.ndjson` files at the top of this folder are the first full before-and-after loop and the raw Kane output of the earliest runs.
