## chaos-kane

1 of 7 injected failures survived. Target: http://127.0.0.1:4000
Flow: On this checkout page, type 'Grace Hopper' into the Full name field and 'grace@example.com' into the Email field, then click the Place order button.

| Fault | Result | The user saw | Backend saved |
| --- | --- | --- | --- |
| none | survived | Order placed! Confirmation ORD-0001 | 1 order |
| error500 | failed | Order placed! Confirmation pending | 0 orders |
| slow | survived | Order placed! Confirmation ORD-0002 | 1 order |
| timeout | failed | Placing order... | 0 orders |
| garbage | failed | Order placed! Confirmation pending | 0 orders |
| empty | failed | Order placed! Confirmation pending | 0 orders |
| reset | failed | Order placed! Confirmation pending | 0 orders |
| ghost | failed | Order placed! Confirmation ORD-0004 | 2 orders |
