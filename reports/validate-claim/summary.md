## chaos-kane

1 of 1 injected failures survived. Target: http://127.0.0.1:4000
Flow: On this checkout page, type 'Grace Hopper' into the Full name field and 'grace@example.com' into the Email field, then click the Place order button.

Agent claimed: "handles API failures". Kane found: 1 of 1 injected failures survived. Claim supported.

| Fault | Result | The user saw | Backend saved |
| --- | --- | --- | --- |
| none | survived | Order placed! Confirmation ORD-0001 | 1 order |
| error500 | survived | We couldn't place your order. Please try again. | 0 orders |

### Compared with baseline

- Fixed: error500
- Unchanged: none
