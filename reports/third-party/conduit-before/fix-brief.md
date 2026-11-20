# chaos-kane fix brief

Target: http://127.0.0.1:3001
User flow: Click 'Login' in the top navigation. Enter the email chaos@example.com and the password ********, then click the Login button. Click 'New Article'. For the title use the words 'Chaos test' followed by six random digits. For the description enter 'Checking failures' and for the body enter 'Written by a chaos test'. Then click 'Publish Article'.

Result: 0 of 5 injected failures survived.

Kane drove the flow in a real browser while a proxy broke the API. A separate check compared what the user was told with what the backend really stored. These scenarios failed:

### error500
- Verdict: failed. no article saved and no clear error shown; page says "none" (request returned HTTP 500)
- The user saw: "none"
- The write request: HTTP 500
- The backend actually saved: 0 articles

### garbage
- Verdict: failed. no article saved and no clear error shown; page says "404 Not Found" (request returned HTTP 200)
- The user saw: "404 Not Found"
- The write request: HTTP 200
- The backend actually saved: 0 articles

### empty
- Verdict: failed. no article saved and no clear error shown; page says "404 Not Found" (request returned HTTP 200)
- The user saw: "404 Not Found"
- The write request: HTTP 200
- The backend actually saved: 0 articles

### reset
- Verdict: failed. no article saved and no clear error shown; page says "404 Not Found" (request got no HTTP status)
- The user saw: "404 Not Found"
- The write request: no response
- The backend actually saved: 0 articles

### ghost
- Verdict: failed. article was saved but the user saw "404 Not Found" (request got no HTTP status)
- The user saw: "404 Not Found"
- The write request: no response
- The backend actually saved: 1 article

## What a correct fix looks like

- Show a success message only when the write request returned a 2xx status and a valid body that confirms the article.
- In every other case (HTTP error, invalid or empty body, dropped connection, no answer) show a clear error and never claim success.
- Give up on a request that gets no answer after a few seconds and show the error.
- A retry after a lost response must not create a second article: send an idempotency key that stays the same for a retry of the same action, and have the server return the existing article for a repeated key.

## Rules

- Fix the application code. Do not edit chaos-kane, its proxy, its checks or any test that verifies the behaviour: they are the checker, and an honest fix is the only one that passes.
- Do not hide failures. The check compares what the user sees with the real backend state.
- Run chaos-kane again after the change to confirm.
