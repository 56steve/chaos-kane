# Submission text

Copy each block into the matching field of the submission form. Character limits are checked.

## Form fields

**Project name**

chaos-kane

**One-liner** (163 of 170)

chaos-kane breaks your app's API with Kane CLI and checks what the user was told against what the backend really did, then hands the evidence to your coding agent.

**Project details** (1183 of 1500)

AI coding agents say "errors are handled" and nobody checks. chaos-kane is a fault proxy plus Kane CLI. The proxy sits in front of a running web app and breaks one API call: HTTP 500, no answer, a garbage or empty reply, a dropped connection, or a reply lost after the save. Kane drives the real user flow in Chrome and records what the page said. A separate harness then compares three facts: the page text, the browser's own network log, and what the backend really stored. That catches fake successes ("Order placed!" after a 500) and duplicate orders after a retry.

Kane only observes; it never judges. Anything the evidence cannot prove is reported as "unable to verify", never as a pass.

It is for anyone letting an agent write checkout, booking or sign-up flows. Results: our demo shop survived 1 of 7 injected failures before one fix and 7 of 7 after. On Conduit, the RealWorld reference app (not our code), it survived 0 of 5 (a blank page on a 500, a 404 page on a bad reply) and 4 of 5 after a small fix.

It learns which request to break from a baseline run, so a login is left alone. `chaos-kane audit` recomputes any saved verdict from its evidence, free and offline.

**Anything else to add** (optional)

How the agent and Kane talk: when something fails, chaos-kane writes fix-brief.md (the evidence and what a correct fix looks like) for any coding agent. A stop hook runs Kane when the agent tries to finish and blocks it until the checkout survives; an MCP server (chaos_check, chaos_doctor, chaos_scenarios, with progress updates) lets any agent run the check itself. A baseline compare fails CI only on new failures.

What Kane caught: fake success on a 500, a duplicate order after a lost reply, and on Conduit a blank page and a 404 page where an error should show. The stop hook and MCP server were verified by driving their protocols directly, not yet inside a live agent session.

Run it: Node 22, Chrome, npm install -g @testmuai/kane-cli, kane-cli login, then clone the repo and run npm run doctor, then npm run chaos (about 120 to 240 credits; --dry-run shows the cost first). npm run audit -- reports/replay-before is free and offline.

Next: one-command wiring into more agents, and turning a failure into a permanent test.

**Agent used**

Claude Code

**YouTube demo video:** paste the unlisted or public YouTube link (about 3 minutes).
**GitHub URL:** https://github.com/56steve/chaos-kane (must be public).
**Live URL** (optional): leave empty, or use the GitHub Pages replay if it is enabled.

## Where to post (at least 2 different posts are required; each extra one earns points)

1. **X** (two different posts, below): fastest, and two separate posts already meet the minimum.
2. **LinkedIn** (below): good reach with developers and engineering leads.
3. **Hacker News** (Show HN, below): the biggest reach, but only post it if the repo is public and the account is not brand new. Do not ask for upvotes.
4. **Reddit** (below): r/SideProject or r/node, and read the subreddit's self-promotion rules first.

Paste the link to each post itself, not a profile. Open the launch guide linked from the form for the official hashtags and who to tag, and swap them in.

## Post drafts

**X post 1** (268 of 280)

AI agents say "errors are handled" and nobody checks. chaos-kane breaks your API, lets Kane CLI click through the real flow, and compares what the user saw with what the backend did.

It found a blank page on a 500 in a reference app.

https://github.com/56steve/chaos-kane #KaneCLI

**X post 2** (274 of 280)

Same app, same flow, before and after one small fix to its error handling: 0 of 5 injected API failures survived, then 4 of 5.

Before: a blank page on a 500, a "404 Not Found" on a bad reply. After: a clear error.

Evidence and screenshots: https://github.com/56steve/chaos-kane/tree/main/reports/third-party #KaneCLI

**LinkedIn**

AI coding agents are good at saying "errors are handled". Almost nobody checks what the user actually sees when the API fails.

For the KaneCLI Online Hackathon I built chaos-kane. A proxy breaks one API call (a 500, no answer, a garbage reply, a dropped connection, a reply lost after the save). Kane CLI drives the real user flow in Chrome and records what the page says. A separate harness then compares three facts: the page, the browser's network log, and what the backend really stored.

What it found:
- on a small demo shop, 1 of 7 injected failures survived, then 7 of 7 after one fix
- on Conduit, the RealWorld reference app (not my code), 0 of 5 survived: a blank page on a 500, a 404 page on a bad reply. After a small fix, 4 of 5

Kane only observes. When the evidence cannot prove something, the result is "unable to verify", never a pass. And any saved verdict can be recomputed from its evidence, offline and free.

Code and evidence: https://github.com/56steve/chaos-kane

#KaneCLI #testing #AI

**Hacker News** (title, 75 of 80)

Show HN: chaos-kane – break your API, check what the user was actually told

First comment, posted right after submitting:

I kept seeing coding agents report that errors are handled, so I built a way to check. chaos-kane puts a fault proxy in front of a running web app and breaks one API call. Kane CLI drives the real user flow in Chrome and records what the page says. A harness compares that with the browser's own network log and with what the backend really stored.

On a demo shop it caught "Order placed!" after a 500 and a duplicate order after a lost reply. On Conduit (the RealWorld reference app) it found a blank page on a 500 and a 404 page on a bad reply: 0 of 5 injected failures survived, 4 of 5 after a small fix. The evidence is in the repo.

To try it you need Kane CLI (free credits on signup), Node 22 and Chrome. If you only want to check the claims, `npm run audit -- reports/replay-before` recomputes the saved verdicts from their evidence, offline.

Known gaps: it is only tested on macOS so far, and the stop hook and MCP server are verified at the protocol level, not yet in many agents. Feedback welcome.

https://github.com/56steve/chaos-kane

**Reddit** (title, then body)

I built a tool that breaks your API and checks what the user is actually told (0 of 5 → 4 of 5 on the RealWorld reference app)

chaos-kane puts a fault proxy in front of a running web app and breaks one API call (500, no answer, bad body, dropped connection, a reply lost after the save). Kane CLI drives the real flow in Chrome; a harness compares what the page said with the network log and the backend's real state.

On Conduit, the RealWorld reference app, it found a blank page on a 500 and a 404 page on a bad reply. After a small fix to the error handling, 4 of 5 injected failures survived instead of 0.

Anything it cannot prove is reported as "unable to verify", never a pass, and saved verdicts can be recomputed offline with `npm run audit`.

Code and evidence: https://github.com/56steve/chaos-kane. Happy to answer questions.
