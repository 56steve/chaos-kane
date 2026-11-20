## chaos-kane

0 of 5 injected failures survived. Target: http://127.0.0.1:3001
Flow: Click 'Login' in the top navigation. Enter the email chaos@example.com and the password ********, then click the Login button. Click 'New Article'. For the title use the words 'Chaos test' followed by six random digits. For the description enter 'Checking failures' and for the body enter 'Written by a chaos test'. Then click 'Publish Article'.

| Fault | Result | The user saw | Backend saved |
| --- | --- | --- | --- |
| none | survived | Taken to /#/article/chaos-test482917 | 1 article |
| error500 | failed | none | 0 articles |
| garbage | failed | 404 Not Found | 0 articles |
| empty | failed | 404 Not Found | 0 articles |
| reset | failed | 404 Not Found | 0 articles |
| ghost | failed | 404 Not Found | 1 article |
