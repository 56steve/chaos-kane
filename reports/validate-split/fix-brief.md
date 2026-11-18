# chaos-kane fix brief

Target: http://127.0.0.1:4400
User flow: On this checkout page, type 'Grace Hopper' into the Full name field and 'grace@example.com' into the Email field, then click the Place order button.

Result: 0 of 1 injected failures survived.

Kane drove the flow in a real browser while a proxy broke the API. A separate check compared what the user was told with what the backend really stored. These scenarios failed:

### none
- Verdict: failed. fake success: page says "Order placed! Confirmation ORD-0001" but the backend has no order (request returned HTTP 201)
- The user saw: "Order placed! Confirmation ORD-0001"
- The write request: HTTP 201
- The backend actually saved: 0 orders

## What a correct fix looks like

- Show a success message only when the write request returned a 2xx status and a valid body that confirms the order.
- In every other case (HTTP error, invalid or empty body, dropped connection, no answer) show a clear error and never claim success.
- Give up on a request that gets no answer after a few seconds and show the error.
- A retry after a lost response must not create a second order: send an idempotency key that stays the same for a retry of the same action, and have the server return the existing order for a repeated key.

## Not verified

These scenarios produced no usable result, so nothing can be said about them. They are not passes.

- error500: the error500 fault never fired: no POST/PUT/PATCH/DELETE request under /api/ reached the proxy. If the app's API is on another origin, the proxy cannot see it

## Rules

- Fix the application code. Do not edit chaos-kane, its proxy, its checks or any test that verifies the behaviour: they are the checker, and an honest fix is the only one that passes.
- Do not hide failures. The check compares what the user sees with the real backend state.
- Run chaos-kane again after the change to confirm.
