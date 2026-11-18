const ORDER_TIMEOUT_MS = 8000;
const ERROR_MESSAGE = "We couldn't place your order. Please try again.";

const form = document.querySelector('#checkout');
const status = document.querySelector('#status');
const submitButton = document.querySelector('#place-order');

/**
 * Sends the order and returns its confirmation id. Throws unless the server
 * answered with a 2xx status and a JSON body that carries an order id.
 */
async function placeOrder(payload) {
  const response = await fetch('/api/order', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(ORDER_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`order request failed with HTTP ${response.status}`);
  }
  const data = await response.json();
  if (typeof data.id !== 'string' || data.id.length === 0) {
    throw new Error('order response had no confirmation id');
  }
  return data.id;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(form));
  status.textContent = 'Placing order...';
  submitButton.disabled = true;

  try {
    const orderId = await placeOrder(payload);
    status.textContent = `Order placed! Confirmation ${orderId}`;
  } catch {
    status.textContent = ERROR_MESSAGE;
  } finally {
    submitButton.disabled = false;
  }
});
