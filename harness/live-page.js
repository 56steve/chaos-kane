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
      --ok-tint: oklch(96% 0.025 155);
      --warn: oklch(55% 0.13 75);
      --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    * { box-sizing: border-box; }
    html { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; font-size: clamp(15px, 11.6px + 0.385vw, 20px); }
    body { margin: 0; background: var(--bg); color: var(--ink); font: 1rem/1.5 var(--sans); }
    main { max-width: 76rem; margin: 0 auto; padding: 1.5rem clamp(1rem, 4vw, 1.5rem) 3rem; }
    .brand { display: flex; justify-content: space-between; align-items: center; gap: 1rem; color: var(--muted); font-size: 0.875rem; }
    .brand strong { color: var(--ink); font-weight: 700; letter-spacing: 0.01em; }
    h1 { margin: 2rem 0 0; font-size: clamp(2rem, 1.2rem + 3vw, 3.6rem); line-height: 1.05; font-weight: 700; letter-spacing: -0.03em; }
    h1.good { color: var(--ok); }
    h1.bad { color: var(--bad); }

    .strip { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 0.5rem; margin: 2rem 0 1.5rem; }
    .seg { padding: 0.35rem 0; min-height: 2.75rem; border: 0; background: none; font: inherit; text-align: left; color: var(--muted); cursor: pointer; }
    .seg .bar { display: block; height: 0.4rem; margin-bottom: 0.45rem; border-radius: 999px; background: var(--line); }
    .seg .name { display: block; font-size: 0.8125rem; line-height: 1.25; }
    .seg.running .bar { background: var(--ink); animation: pulse 1s ease-in-out infinite; }
    .seg.survived .bar { background: var(--ok); }
    .seg.failed .bar { background: var(--bad); }
    .seg.incomplete .bar { background: var(--warn); }
    .seg.selected .name { color: var(--ink); font-weight: 700; }
    .seg:focus-visible { outline: 2px solid var(--ink); outline-offset: 4px; }

    .stage { padding-top: 1.5rem; border-top: 1px solid var(--ink); }
    .stage-head { display: flex; align-items: baseline; gap: 0.9rem; flex-wrap: wrap; }
    .stage-head h2 { margin: 0; font-size: 1.5rem; font-weight: 700; letter-spacing: -0.01em; }
    .stage-head p { margin: 0; color: var(--muted); }
    .duel { display: grid; grid-template-columns: 1fr 9rem 1fr; align-items: stretch; gap: 1rem; margin-top: 1.25rem; }
    .side { padding: 1.4rem 1.5rem; border: 1px solid var(--line); border-radius: 0.5rem; background: #fff8; min-height: 12rem; }
    .label { margin-bottom: 0.9rem; font-size: 0.75rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); }
    .said { font-size: clamp(1.4rem, 0.9rem + 1.5vw, 2.2rem); line-height: 1.2; font-weight: 700; letter-spacing: -0.015em; overflow-wrap: anywhere; }
    .count { font-size: clamp(3rem, 1.5rem + 3.6vw, 5rem); line-height: 1; font-weight: 700; letter-spacing: -0.03em; font-variant-numeric: tabular-nums; }
    .count small { display: block; margin-top: 0.4rem; font-size: 1.125rem; font-weight: 500; letter-spacing: 0; color: var(--muted); }
    .meta { margin-top: 0.9rem; font: 0.875rem var(--mono); color: var(--muted); }
    .middle { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
    .middle .sign { font-size: 4rem; line-height: 1; font-weight: 700; color: var(--muted); }
    .middle .word { margin-top: 0.5rem; font-size: 0.8125rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); }
    .stage.failed .side { border-color: var(--bad); }
    .stage.failed .side.truth { background: var(--bad-tint); }
    .stage.failed .count, .stage.failed .middle .sign, .stage.failed .middle .word { color: var(--bad); }
    .stage.survived .side { border-color: var(--ok); }
    .stage.survived .side.truth { background: var(--ok-tint); }
    .stage.survived .count, .stage.survived .middle .sign, .stage.survived .middle .word { color: var(--ok); }
    .stage.incomplete .middle .sign, .stage.incomplete .middle .word { color: var(--warn); }

    .now { margin-top: 1.5rem; min-height: 1.5em; font: 0.875rem var(--mono); color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .now.fault { color: var(--bad); font-weight: 700; }

    button.again { margin-left: 0.75rem; padding: 0.25rem 0.75rem; font: inherit; font-size: 0.8125rem; color: var(--ink); background: transparent; border: 1px solid var(--ink); border-radius: 0.3rem; cursor: pointer; }
    button.again:hover { background: var(--ink); color: var(--bg); }
    button.again:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }

    @keyframes pulse { 0%, 100% { opacity: 0.25; } 50% { opacity: 1; } }
    @media (prefers-reduced-motion: reduce) { .seg.running .bar { animation: none; } }
    @media (max-width: 960px) {
      .duel { grid-template-columns: 1fr 6.5rem 1fr; gap: 0.75rem; }
      .side { padding: 1.1rem 1.15rem; }
      .strip { gap: 0.4rem; }
      .seg .name { font-size: 0.75rem; }
    }
    @media (max-width: 640px) {
      h1 { margin-top: 1.5rem; }
      .brand { flex-direction: column; align-items: flex-start; gap: 0.35rem; }
      .strip { grid-auto-flow: row; grid-template-columns: 1fr 1fr; gap: 0.25rem 0.75rem; margin: 1.5rem 0 1rem; }
      .seg .name { font-size: 0.875rem; }
      .stage { padding-top: 1.25rem; }
      .duel { grid-template-columns: 1fr; gap: 0.5rem; margin-top: 1rem; }
      .side { min-height: 0; }
      .middle { flex-direction: row; gap: 0.75rem; justify-content: flex-start; padding: 0.15rem 0.25rem; }
      .middle .sign { font-size: 2.25rem; }
      .middle .word { margin-top: 0; }
    }
  </style>
</head>
<body>
  <main>
    <div class="brand"><strong>Chaos Kane</strong><span><span id="target"></span><span id="mode"></span></span></div>
    <h1 id="headline">Waiting for a run</h1>

    <div class="strip" id="strip" role="group" aria-label="Scenarios"></div>

    <section class="stage" id="stage" aria-live="polite">
      <div class="stage-head"><h2 id="stageTitle">Nothing running yet</h2><p id="stageNote"></p></div>
      <div class="duel">
        <div class="side">
          <div class="label">Page said</div>
          <div class="said" id="said"></div>
          <div class="meta" id="request"></div>
        </div>
        <div class="middle"><div class="sign" id="sign"></div><div class="word" id="word"></div></div>
        <div class="side truth">
          <div class="label">Backend saved</div>
          <div class="count" id="count"></div>
        </div>
      </div>
    </section>

    <div class="now" id="now"></div>
  </main>
  <script>
    (function () {
      var TITLES = {
        none: 'Healthy API', error500: 'Server error', slow: 'Slow server', timeout: 'No answer',
        garbage: 'HTML, not JSON', empty: 'Empty reply', reset: 'Dropped', ghost: 'Reply lost'
      };
      var NOTES = {
        none: 'nothing broken', error500: 'API answers 500', slow: 'API answers after 6s',
        timeout: 'API never answers', garbage: 'API answers HTML', empty: 'API answers nothing',
        reset: 'connection cut', ghost: 'saved, reply lost, user retries'
      };
      var strip = document.getElementById('strip');
      var nowEl = document.getElementById('now');
      var headlineEl = document.getElementById('headline');
      var targetEl = document.getElementById('target');
      var modeEl = document.getElementById('mode');
      var stageEl = document.getElementById('stage');
      var els = {};
      ['stageTitle', 'stageNote', 'said', 'request', 'sign', 'word', 'count'].forEach(function (id) { els[id] = document.getElementById(id); });

      var data = {};
      var order = [];
      var noun = 'record';
      var latest = null;
      var pinned = null;
      var timer = null;

      function make(tag, cls, text) {
        var el = document.createElement(tag);
        if (cls) { el.className = cls; }
        if (text !== undefined) { el.textContent = text; }
        return el;
      }
      function title(scenario) { return TITLES[scenario] || scenario; }

      function say(text, kind) {
        nowEl.textContent = text;
        nowEl.className = 'now' + (kind ? ' ' + kind : '');
      }

      function reset() {
        data = {}; order = []; latest = null; pinned = null;
        strip.textContent = '';
        headlineEl.className = '';
        headlineEl.textContent = 'Waiting for a run';
        say('', '');
        render();
      }

      function describeRequest(status) {
        var text = String(status === undefined || status === null ? '' : status);
        if (text.length === 3 && !isNaN(Number(text))) { return 'HTTP ' + text; }
        return text === '' ? '' : text;
      }

      function verdictOf(result) {
        var why = (result.reasons || []).join(' ');
        if (result.outcome === 'survived') { return { sign: '=', word: 'Honest' }; }
        if (result.outcome === 'incomplete') { return { sign: '?', word: 'No data' }; }
        if (why.indexOf('fake success') !== -1) { return { sign: '\\u2260', word: 'Fake success' }; }
        if (why.indexOf('duplicate') !== -1) { return { sign: '\\u2260', word: 'Duplicate' }; }
        return { sign: '\\u2260', word: 'No error' };
      }

      function ensureSegment(scenario) {
        if (data[scenario]) { return data[scenario]; }
        var button = make('button', 'seg');
        button.type = 'button';
        button.appendChild(make('span', 'bar'));
        button.appendChild(make('span', 'name', title(scenario)));
        button.onclick = function () { pinned = scenario; render(); };
        strip.appendChild(button);
        data[scenario] = { button: button, status: 'waiting', result: null };
        order.push(scenario);
        return data[scenario];
      }

      function render() {
        var name = pinned || latest;
        order.forEach(function (scenario) {
          var item = data[scenario];
          item.button.className = 'seg ' + item.status + (scenario === name ? ' selected' : '');
        });
        if (!name) {
          stageEl.className = 'stage';
          return;
        }
        var item = data[name];
        els.stageTitle.textContent = title(name);
        els.stageNote.textContent = NOTES[name] || '';
        if (item.result) {
          var result = item.result;
          var verdict = verdictOf(result);
          var count = result.orderCount === undefined ? (result.orderCreated ? 1 : 0) : result.orderCount;
          stageEl.className = 'stage ' + result.outcome;
          els.said.textContent = result.statusMessage === undefined ? 'nothing' : '\\u201C' + result.statusMessage + '\\u201D';
          els.request.textContent = describeRequest(result.requestStatus);
          els.sign.textContent = verdict.sign;
          els.word.textContent = verdict.word;
          els.count.textContent = String(count);
          els.count.appendChild(make('small', '', noun + (count === 1 ? '' : 's')));
        } else {
          stageEl.className = 'stage';
          els.said.textContent = item.status === 'running' ? '...' : '';
          els.request.textContent = '';
          els.sign.textContent = item.status === 'running' ? '...' : '';
          els.word.textContent = item.status === 'running' ? 'Kane' : '';
          els.count.textContent = '';
        }
      }

      function handle(event) {
        var item;
        if (event.type === 'run_start') {
          reset();
          noun = event.noun || 'record';
          targetEl.textContent = event.target;
          headlineEl.textContent = 'Breaking ' + event.target;
          event.scenarios.forEach(ensureSegment);
        } else if (event.type === 'scenario_start') {
          item = ensureSegment(event.scenario);
          item.status = 'running';
          latest = event.scenario;
          headlineEl.textContent = 'Running: ' + title(event.scenario);
          say('Kane starts', '');
        } else if (event.type === 'fault') {
          say('fault: ' + event.action, 'fault');
        } else if (event.type === 'kane_line') {
          say('Kane: ' + event.text, '');
        } else if (event.type === 'scenario_result') {
          item = ensureSegment(event.scenario);
          item.status = event.outcome;
          item.result = event;
          latest = event.scenario;
          say('', '');
        } else if (event.type === 'run_end') {
          var s = event.summary;
          headlineEl.className = s.failed === 0 && s.incomplete === 0 ? 'good' : 'bad';
          headlineEl.textContent = s.survived + ' of ' + s.total + ' survived';
          say('', '');
        }
        render();
      }

      function connectLive() {
        modeEl.textContent = ' \\u00B7 live';
        var source = new EventSource('/events');
        source.onmessage = function (message) { handle(JSON.parse(message.data)); };
      }

      function replay(events) {
        if (timer) { clearTimeout(timer); }
        reset();
        modeEl.textContent = ' \\u00B7 replay';
        var index = 0;
        function step() {
          if (index >= events.length) { return; }
          handle(events[index]);
          var next = events[index + 1];
          var wait = 150;
          if (next) {
            var gap = new Date(next.at).getTime() - new Date(events[index].at).getTime();
            wait = Math.min(1100, Math.max(250, gap / 30));
          }
          index += 1;
          timer = setTimeout(step, wait);
        }
        step();
        var button = make('button', 'again', 'Replay');
        button.type = 'button';
        button.onclick = function () { replay(events); };
        modeEl.appendChild(button);
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
