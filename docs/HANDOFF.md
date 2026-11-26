# Handoff: where this project stands

Written 20 Nov 2026. **Event deadline: 26 Nov 2026, 11:59 PM IST (10:29 AM PT).** Submissions can be edited until then.

chaos-kane breaks an app's API on purpose with a fault proxy, lets Kane CLI drive the user flow in real Chrome, and checks what the user was told against what the backend really did. When something does not survive it writes a fix brief any coding agent can use. See the [README](../README.md) for how it works.

## State of the repo

- Branches: `main` (default) and `development` (where work happens). Merge `development` into `main` with a fast-forward so hashes stay the same, and check `git rev-list --left-right --count origin/main...origin/development` before submitting.
- The repo is **private**. It must be made public before submitting (judges need to run it).
- GitHub Pages is **not** enabled. `docs/index.html` is a static replay that can be hosted there if wanted.
- Checks: `npm test` (304 tests), `npm run smoke`, `npm run check`. All pass. CI runs them on pushes to `main` and `development` (Node 22).

## Set up on a new machine

Needs Node 22+, Google Chrome, and a TestMu AI account with Kane CLI credits (a run is roughly 15 to 30 credits). `unzip` is needed for screenshots and the network-log cross-check; without it runs still work but are less strongly verified.

```bash
git clone <repo-url> && cd chaos-kane
npm install -g @testmuai/kane-cli
kane-cli login
npm run doctor                         # checks everything, prints the fix for anything missing
npm test && npm run smoke              # no Kane needed
node bin/chaos-kane.js --demo --dry-run   # shows the plan and credit cost, spends nothing
npm run chaos                          # the demo shop through Kane (about 120 to 240 credits)
```

## What is built

- Fault proxy with 8 scenarios, including a lost reply (`ghost`) and a double click (`double`). HTTPS upstreams work, and a site that writes its own absolute address stays inside the proxy.
- The fault target is **learned**: the baseline run records the flow's writes and every fault then hits only the last successful one (the login is left alone). `--fault-paths` overrides it.
- Verdicts come from three facts (page text, the browser's network log, the backend's real record count), never from Kane's own pass or fail. Anything unprovable is "unable to verify".
- `audit`: recomputes the verdicts of any saved report from its own evidence, with no Kane, no credits and no network, and exits 1 if one was edited (`npm run audit -- reports/replay-before`). The tests run it over every committed report.
- `doctor` (setup check), `--dry-run`, `--max-steps`, `--repeat`, `--baseline` (fail only on new failures), `--agent-claim`.
- Outputs: HTML report, `summary.md` (also the GitHub job summary), `fix-brief.md`, status badge, static replay and live dashboard.
- Agent hooks: MCP server (`bin/chaos-kane-mcp.js`: `chaos_check`, `chaos_scenarios`, `chaos_doctor`, with progress updates while it runs) and a stop hook (`hooks/stop-gate.js`, registered in `.claude/settings.json`).

## Evidence that it works

| What | Where | Result |
|---|---|---|
| Demo shop, before and after one fix | `reports/replay-before`, `reports/replay-after` | 1 of 7 survived, then 7 of 7 |
| Repeat runs | `reports/stability` | same verdicts on 3 runs of every scenario |
| Conduit (RealWorld reference app, not written by us) | `reports/third-party` | 0 of 5 survived, then 4 of 5 after a small fix ([diff](../reports/third-party/conduit-fix.diff)) |
| Stop hook, simulated with the exact Stop-hook input | run on 20 Nov | broken checkout blocked (exit 2, with evidence), fixed one allowed (exit 0), unchanged code allowed instantly |
| MCP server over the real protocol | run on 20 Nov | handshake, 3 tools, bad input handled, a real `chaos_check` returned evidence and a brief |
| A real HTTPS site | read-only run | page loaded through the proxy, verdict correctly "unable to verify" |

To reproduce the Conduit run: clone [Conduit](https://github.com/TonyMckes/conduit-realworld-example-app), `npm install`, `npm install -w backend sqlite3`, `npm run build -w frontend`, then from `backend/` run `NODE_ENV=production PORT=3001 JWT_KEY=local-test-only PROD_DB_DIALECT=sqlite PROD_DB_HOSTNAME=$PWD/../conduit.sqlite node index.js`. Create a throwaway user with `POST /api/users`, then run chaos-kane with `--app http://127.0.0.1:3001 --truth-url http://127.0.0.1:3001/api/articles --noun article --claims "/article/" --max-steps 30` and a flow that logs in and publishes an article. `git apply reports/third-party/conduit-fix.diff` in the Conduit clone gives the "after".

## Not in the repo (local only)

- `video/` is gitignored: the demo video (`chaos-kane-demo.mp4`, about 3 minutes), its subtitles (`.srt`), `narration.txt`, and `make_conduit_segment.py`. **Back this folder up and upload the video soon.** The generator for the first part of the video was in a temporary folder that was cleaned up, so the video cannot be fully re-rendered from scratch. The base video is kept as `chaos-kane-demo.base.mp4`.
- Raw Kane output (it contains account details) is never committed. Saved reports are scrubbed with `node scripts/scrub-reports.js <folder>`.

## To do (needs the owner)

1. [ ] **Try the MCP server in a real agent session** (optional). The stop hook is already proven live in Claude Code (see the evidence table); the MCP server was only tested by driving its protocol directly.
   - `claude mcp add chaos-kane -- node /absolute/path/to/chaos-kane/bin/chaos-kane-mcp.js`, then ask the agent to call `chaos_doctor`, then `chaos_check` with `faults: ["none","error500"]` on a running app.
   - To repeat the hook test yourself: open this repo in Claude Code, run `git show 1167bf3:app/client.js > app/client.js` (the original "fake success" checkout), and ask the agent to stop. Kane should block it with the evidence. Restore the file with `git checkout app/client.js`.
2. [ ] Merge `development` into `main`, make the repo public, then clone it fresh from the public URL and run `npm run doctor`, `npm test` and `npm run smoke` as an outsider would.
3. [ ] Upload the demo video to YouTube (unlisted is fine) with the `.srt` as captions.
4. [ ] Publish at least **two different public posts** about the project (Hacker News, X, Reddit or LinkedIn). Drafts are in [submission.md](submission.md); fill in the repo and video links.
5. [ ] Confirm event registration (Luma or the event site) and that the same email is used on the TestMu AI account.
6. [ ] Submit the form: GitHub URL, about-the-app text ([submission.md](submission.md)), YouTube link, optional live URL, and the post links.

Plan: feature freeze 22 Nov, repo public 24 Nov, submit 25 Nov, leaving a day of buffer.

## Known risks and worries

1. **The MCP server was never run inside a live agent** (see To do 1), and the stop hook is proven live in Claude Code only, not in other agents.
2. **Timing.** The stop hook takes about 5 minutes each time code in `app/` or `chaos/` changed. A `chaos_check` takes roughly 2 to 3 minutes per scenario (about 8 minutes for the default three). The server sends progress updates and a 15-second heartbeat, but clients may still time out on their own. Quick check: `faults: ["none","error500"]`. The stop hook and the demo use fixed ports (4100 for the proxy, 4000 for the demo app); if another run holds them, the hook reports that it could not run and lets the agent stop, because it is designed to fail soft.
3. **Kane is an AI agent and varies between runs.** Seen in practice: it gave up on a multi-part instruction, ran out of steps on a longer flow (raise `--max-steps`), and sometimes observed things differently. `--repeat` measures it.
4. **Developed and run on macOS.** A Windows launcher fix (the `kane-cli.cmd` shim) is in and unit-tested, and CI runs the unit tests on Linux. A full Kane run on Windows or Linux is not confirmed here.
5. **An API on another domain is invisible to the proxy.** Those scenarios report "unable to verify" with the reason.
6. **The CI template (`docs/ci-example.yml`) has never been run.**
7. **A reply lost after the save still fails on Conduit** after the fix. The user is told it failed but the article exists. Fixing it needs the server to recognise retries.
8. **A public test store gave no usable verdict.** Its success message is a toast that vanishes, so success and failure look the same afterwards. It is not used as evidence.
9. **Judges need a Kane login, credits, Chrome and Node 22.** `npm run doctor` explains any gap.
10. **Rough edges on unfamiliar apps.** Testing on Conduit exposed several harness problems in one day (paginated truth counts, only the first network log read, success shown by a new page). They are fixed, but another app may show a new one.
11. **Git history was rewritten once** to remove a personal email address. Commits use the GitHub noreply address; keep it that way.

## Conventions

- Commit messages: one line, conventional style (`feat(scope): summary`), no body.
- Work on `development`; merge to `main` only when ready, as a fast-forward.
- Never commit raw Kane evidence or anything with account details or share links. Do not put personal data in the repo.
- Node 22 is required (the test script uses a glob that older versions do not expand).

## Where things are

- `bin/` CLI and MCP entry points; `harness/` verdicts, runner, evidence, reports, MCP; `chaos/` proxy; `app/` demo shop; `hooks/` stop hook; `scripts/` smoke test, replay, badge, scrubber.
- `docs/` spike findings, CI example, submission text, replay site; `reports/` committed evidence from real runs.
