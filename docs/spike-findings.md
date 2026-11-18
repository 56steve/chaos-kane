# Spike findings (Kane CLI 0.10.6, 2026-11-18)

Setup: demo shop behind the chaos proxy (`npm start`), Kane pointed at `http://127.0.0.1:4100`,
run with `--agent --headless`. Ground truth is the backend order list at `http://127.0.0.1:4000/api/orders`.

| Run | Scenario | Objective style | Kane exit / reason | What Kane reported | Backend truth |
|---|---|---|---|---|---|
| 1 | none | do the flow, report the status message | 0 / success.complete | "Order placed! Confirmation ORD-0001" | order stored |
| 2 | error500 | do the flow, then report the status message and the HTTP status of the order request | 0 / success.complete | page said "Order placed! Confirmation pending", order request returned 500 (both in `final_state`) | no order created |
| 3 | error500 | assert-style: PASS only if request was 2xx and page confirms | 0 / success.complete (wrong) | summary treated the checkout as completed; never mentioned the 500 | no order created |

Cost per run: about 15 to 22 credits, 60 seconds or less.

## What this means

1. Kane can observe the lie. In run 2 it surfaced the page text and the real HTTP status as structured `final_state` values.
2. Kane's own pass or fail is not a reliable judge of the lie. In run 3 it passed a broken checkout.
3. So the harness must judge, not Kane. Ask Kane to extract named values (page status text, order request HTTP status), then decide pass or fail in code by comparing them with each other and with the backend order list.
4. This matches the honest-verdict rule: a missing value counts as a failure, and the verdict never rests on Kane's exit code alone.

## Design decision

`verdict = f(kane.final_state, backend truth)`:

- fail if the order request status is not 2xx while the page claims success
- fail if the page claims success but the backend has no new order
- fail if Kane returns no extracted values (incomplete, not a pass)
