# Submission text

## One paragraph

chaos-kane breaks an app's API on purpose and checks what the user is really told. It puts a fault proxy in front of a running web app, then lets Kane CLI drive the user flow in real Chrome while the proxy injects failures: HTTP 500, no answer, a garbage reply, a dropped connection, and a lost reply that makes the user retry. Kane observes; the harness judges, comparing what the page said with the network log and what the backend actually stored. That catches the failures nobody sees, like "Order placed!" after a 500, or a duplicate order after a retry. When something does not survive, it writes a fix brief any coding agent can act on, a Claude Code Stop hook and an MCP tool keep the agent from finishing until the app survives, and a baseline compare fails CI only on new failures. Runs it cannot verify are reported as "unable to verify", never as a pass.

## Run command

```bash
npm install -g @testmuai/kane-cli && kane-cli login
git clone <repo-url> && cd chaos-kane
npm run doctor      # checks the machine, no credits used
npm run chaos       # the demo shop through Kane, writes reports/latest.html
```

## Launch post drafts

**Post 1 (what it is)**
Coding agents say "handles API failures" and nobody checks. I built chaos-kane for the KaneCLI Hackathon: it breaks your API with a fault proxy, lets Kane CLI click through the real flow in Chrome, and checks what the user was told against what the backend really did. It caught "Order placed!" after a 500, and duplicate orders after a retry. Repo: <repo-url> #KaneCLI

**Post 2 (the result)**
The part I like most in chaos-kane: Kane only observes, a separate harness judges, and anything it cannot prove is reported as "unable to verify", not a pass. Then it writes a fix brief for your coding agent and re-checks after the fix. Replay of a real before and after run: <pages-or-repo-url> #KaneCLI
