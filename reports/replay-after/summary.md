## chaos-kane

7 of 7 injected failures survived. Target: http://127.0.0.1:4000
Flow: On this checkout page, type 'Grace Hopper' into the Full name field and 'grace@example.com' into the Email field, then click the Place order button.

| Fault | Result | The user saw | Backend saved |
| --- | --- | --- | --- |
| none | survived | Order placed! Confirmation ORD-0001 | 1 order |
| error500 | survived | We couldn't place your order. Please try again. | 0 orders |
| slow | survived | Order placed! Confirmation ORD-0002 | 1 order |
| timeout | survived | We couldn't place your order. Please try again. | 0 orders |
| garbage | survived | We couldn't place your order. Please try again. | 0 orders |
| empty | survived | We couldn't place your order. Please try again. | 0 orders |
| reset | survived | We couldn't place your order. Please try again. | 0 orders |
| ghost | survived | Order placed! Confirmation ORD-0003 | 1 order |
