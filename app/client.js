// Baseline checkout client: the version an AI agent ships when it claims
// "errors are handled". It swallows every failure and still reports success.
// Chaos Kane exists to catch exactly this, and the repair loop must replace it.

const form = document.querySelector('#checkout');
const status = document.querySelector('#status');

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(form));
  status.textContent = 'Placing order...';

  try {
    const response = await fetch('/api/order', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    status.textContent = `Order placed! Confirmation ${data.id ?? 'pending'}`;
  } catch {
    status.textContent = 'Order placed! Confirmation pending';
  }
});
