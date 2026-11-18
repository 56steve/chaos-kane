// The live dashboard page. Served by harness/live.js while a run is happening,
// and also usable as a static replay page when an events.json sits next to it.
// Client code avoids template literals and backslashes because this file is itself a template literal.

export const LIVE_PAGE = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Chaos Kane</title>
  <style>
    :root {
      color-scheme: light;
      --bg: oklch(97.5% 0.006 85);
      --ink: oklch(22% 0.012 85);
      --muted: oklch(50% 0.012 85);
      --line: oklch(88% 0.008 85);
      --bad: oklch(50% 0.19 27);
      --bad-tint: oklch(95.5% 0.03 27);
      --ok: oklch(46% 0.11 155);
      --warn: oklch(52% 0.12 75);
      --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--ink); font: 0.9375rem/1.5 var(--sans); }
    main { max-width: 74rem; margin: 0 auto; padding: 2rem 1.25rem 4rem; }
    .brand { display: flex; justify-content: space-between; gap: 1rem; color: var(--muted); font-size: 0.8125rem; }
    .brand strong { color: var(--ink); font-weight: 600; }
    h1 { margin: 2.5rem 0 0.5rem; max-width: 36ch; font-size: 2.1rem; line-height: 1.15; font-weight: 600; letter-spacing: -0.02em; }
    h1.good { color: var(--ok); }
    h1.bad { color: var(--bad); }
    .sub { margin: 0; max-width: 70ch; color: var(--muted); min-height: 1.5em; }
    h2 { margin: 2.5rem 0 0.5rem; font-size: 1.05rem; font-weight: 600; }
    .scroll { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; min-width: 52rem; }
    thead th { padding: 0 1rem 0.55rem 0; text-align: left; font-size: 0.75rem; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); border-bottom: 1px solid var(--ink); }
    tbody th, tbody td { padding: 0.8rem 1rem 0.8rem 0; text-align: left; vertical-align: top; border-bottom: 1px solid var(--line); font-weight: 400; }
    tbody th { font-weight: 600; white-space: nowrap; }
    td.status { white-space: nowrap; font-size: 0.75rem; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); }
    td.status.survived { color: var(--ok); }
    td.status.failed { color: var(--bad); }
    td.status.incomplete { color: var(--warn); }
    td.status .dot { display: inline-block; width: 0.5rem; height: 0.5rem; margin-right: 0.45rem; border-radius: 50%; background: var(--ink); animation: pulse 1s ease-in-out infinite; }
    @keyframes pulse { 0%, 100% { opacity: 0.2; } 50% { opacity: 1; } }
    tr.failed td, tr.failed th { background: var(--bad-tint); }
    .mono { font-family: var(--mono); font-size: 0.8125rem; overflow-wrap: anywhere; }
    .contradiction { color: var(--bad); font-weight: 600; }
    .why { color: var(--muted); font-size: 0.8125rem; max-width: 40ch; }
    .feed { height: 15rem; overflow-y: auto; padding: 0.6rem 0; border-top: 1px solid var(--ink); border-bottom: 1px solid var(--line); font: 0.8125rem/1.55 var(--mono); }
    .line { color: var(--muted); }
    .line.fault { color: var(--bad); font-weight: 600; }
    .line.result { color: var(--ink); font-weight: 600; }
    .line.system { color: var(--ink); }
    button { margin-left: 0.6rem; padding: 0.25rem 0.7rem; font: inherit; font-size: 0.8125rem; color: var(--ink); background: transparent; border: 1px solid var(--ink); border-radius: 0.3rem; cursor: pointer; }
    button:hover { background: var(--ink); color: var(--bg); }
    button:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
    @media (prefers-reduced-motion: reduce) { td.status .dot { animation: none; } }
  </style>
</head>
<body>
  <main>
    <div class="brand"><strong>Chaos Kane</strong><span><span id="target"></span><span id="mode"></span></span></div>
    <h1 id="headline">Waiting for a run</h1>
    <p class="sub" id="sub"></p>

    <h2>What the user saw, and what the backend did</h2>
    <div class="scroll">
      <table>
        <thead><tr><th>Fault injected</th><th>Status</th><th>Page said</th><th>Request</th><th>Backend</th><th>Why</th></tr></thead>
        <tbody id="rows"></tbody>
      </table>
    </div>

    <h2>Live feed</h2>
    <div class="feed" id="feed" aria-live="polite"></div>
  </main>
  <script>
    (function () {
      var TITLES = {
        none: 'Healthy API', error500: 'Server error', slow: 'Slow server', timeout: 'No answer',
        garbage: 'HTML instead of JSON', empty: 'Empty response', reset: 'Connection dropped', ghost: 'Response lost after saving'
      };
      var rowsEl = document.getElementById('rows');
      var feedEl = document.getElementById('feed');
      var headlineEl = document.getElementById('headline');
      var subEl = document.getElementById('sub');
      var targetEl = document.getElementById('target');
      var modeEl = document.getElementById('mode');
      var rows = {};
      var total = 0;
      var finished = 0;
      var noun = 'record';
      var timer = null;

      function make(tag, cls, text) {
        var el = document.createElement(tag);
        if (cls) { el.className = cls; }
        if (text !== undefined) { el.textContent = text; }
        return el;
      }

      function reset() {
        rowsEl.textContent = '';
        feedEl.textContent = '';
        rows = {};
        total = 0;
        finished = 0;
        headlineEl.className = '';
        headlineEl.textContent = 'Waiting for a run';
        subEl.textContent = '';
      }

      function feed(text, kind) {
        feedEl.appendChild(make('div', 'line ' + kind, text));
        while (feedEl.childNodes.length > 80) { feedEl.removeChild(feedEl.firstChild); }
        feedEl.scrollTop = feedEl.scrollHeight;
      }

      function title(scenario) { return TITLES[scenario] || scenario; }

      function describeRequest(status) {
        var text = String(status === undefined || status === null ? '' : status);
        if (text.length === 3 && !isNaN(Number(text))) { return 'HTTP ' + text; }
        return text === '' ? 'not recorded' : text;
      }

      function ensureRow(scenario) {
        if (rows[scenario]) { return rows[scenario]; }
        var tr = make('tr');
        var th = make('th', '', title(scenario));
        var status = make('td', 'status', 'waiting');
        var said = make('td', 'mono');
        var request = make('td', 'mono');
        var backend = make('td', 'mono');
        var why = make('td', 'why');
        [th, status, said, request, backend, why].forEach(function (cell) { tr.appendChild(cell); });
        rowsEl.appendChild(tr);
        rows[scenario] = { tr: tr, status: status, said: said, request: request, backend: backend, why: why };
        return rows[scenario];
      }

      function handle(event) {
        var row;
        if (event.type === 'run_start') {
          reset();
          total = event.scenarios.filter(function (name) { return name !== 'none'; }).length;
          noun = event.noun || 'record';
          targetEl.textContent = event.target;
          headlineEl.textContent = 'Breaking ' + event.target;
          subEl.textContent = event.flow;
          event.scenarios.forEach(ensureRow);
          feed('run started: ' + event.scenarios.length + ' scenario(s), ' + event.repeat + ' run(s) each', 'system');
        } else if (event.type === 'scenario_start') {
          row = ensureRow(event.scenario);
          row.status.textContent = '';
          row.status.className = 'status';
          row.status.appendChild(make('span', 'dot'));
          row.status.appendChild(document.createTextNode(event.runs > 1 ? 'running ' + event.run + '/' + event.runs : 'running'));
          headlineEl.textContent = 'Running: ' + title(event.scenario);
          feed('Kane starts: ' + title(event.scenario), 'system');
        } else if (event.type === 'fault') {
          feed('fault: proxy ' + event.action + ' (' + event.method + ' ' + event.path + ')', 'fault');
        } else if (event.type === 'kane_line') {
          feed('kane: ' + event.text, 'kane');
        } else if (event.type === 'scenario_result') {
          row = ensureRow(event.scenario);
          row.status.textContent = event.outcome + (event.agreement && event.agreement.split('/')[1] !== '1' ? ' ' + event.agreement : '');
          row.status.className = 'status ' + event.outcome;
          row.said.textContent = '"' + (event.statusMessage === undefined ? 'nothing recorded' : event.statusMessage) + '"';
          row.request.textContent = describeRequest(event.requestStatus);
          var count = event.orderCount === undefined ? (event.orderCreated ? 1 : 0) : event.orderCount;
          row.backend.textContent = count > 0 ? count + ' ' + noun + (count === 1 ? '' : 's') + ' saved' : 'none saved';
          var fake = (event.reasons || []).join(' ').indexOf('fake success') !== -1 || (event.reasons || []).join(' ').indexOf('duplicate') !== -1;
          row.backend.className = 'mono' + (fake ? ' contradiction' : '');
          row.why.textContent = (event.reasons || [])[0] || '';
          row.tr.className = event.outcome;
          if (event.scenario !== 'none') { finished += 1; }
          feed(title(event.scenario) + ': ' + event.outcome, 'result');
        } else if (event.type === 'run_end') {
          var s = event.summary;
          headlineEl.className = s.failed === 0 && s.incomplete === 0 ? 'good' : 'bad';
          headlineEl.textContent = 'Survived ' + s.survived + ' of ' + s.total + ' injected failures';
          subEl.textContent = s.failed + ' failed, ' + s.incomplete + ' incomplete. Kane credits used: ' + Math.round(s.credits) + '. Verdicts come from the page text and the backend, never from Kane\\'s own pass or fail.';
          feed('run finished', 'system');
        }
      }

      function connectLive() {
        modeEl.textContent = ' · live';
        var source = new EventSource('/events');
        source.onmessage = function (message) { handle(JSON.parse(message.data)); };
      }

      function replay(events) {
        if (timer) { clearTimeout(timer); }
        reset();
        modeEl.textContent = ' · recorded run, replayed';
        var index = 0;
        function step() {
          if (index >= events.length) { return; }
          handle(events[index]);
          var next = events[index + 1];
          var wait = 150;
          if (next) {
            var gap = new Date(next.at).getTime() - new Date(events[index].at).getTime();
            wait = Math.min(900, Math.max(150, gap / 40));
          }
          index += 1;
          timer = setTimeout(step, wait);
        }
        step();
        if (!document.getElementById('again')) {
          var button = make('button', '', 'Replay');
          button.id = 'again';
          button.onclick = function () { replay(events); };
          modeEl.appendChild(button);
        }
      }

      fetch('events.json')
        .then(function (response) { if (!response.ok) { throw new Error('no recording'); } return response.json(); })
        .then(replay)
        .catch(connectLive);
    })();
  </script>
</body>
</html>
`;
