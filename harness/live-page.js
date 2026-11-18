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
      --muted: oklch(52% 0.012 85);
      --faint: oklch(80% 0.01 85);
      --line: oklch(89% 0.008 85);
      --bad: oklch(50% 0.19 27);
      --bad-tint: oklch(95.5% 0.03 27);
      --ok: oklch(46% 0.11 155);
      --ok-tint: oklch(96% 0.025 155);
      --warn: oklch(58% 0.14 70);
      --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    * { box-sizing: border-box; }
    html { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; font-size: 15px; }
    @media (min-width: 900px) { html { font-size: 14px; } }
    @media (min-width: 1700px) { html { font-size: 15px; } }
    body { margin: 0; background: var(--bg); color: var(--ink); font: 1rem/1.5 var(--sans); }
    main { max-width: 62rem; margin: 0 auto; padding: 1.25rem clamp(1rem, 4vw, 1.5rem) 2.5rem; }
    .bar { display: flex; justify-content: space-between; align-items: center; gap: 1rem; color: var(--muted); font: 0.8125rem var(--mono); }
    .bar strong { color: var(--ink); font-weight: 700; }
    h1 { margin: 1.5rem 0 1.25rem; font-size: 1.9rem; line-height: 1.1; font-weight: 700; letter-spacing: -0.025em; }
    h1.good { color: var(--ok); }
    h1.bad { color: var(--bad); }

    .layout { display: grid; grid-template-columns: 13rem 1fr; gap: 2rem; align-items: start; padding-top: 1.25rem; border-top: 1px solid var(--ink); }
    .list { display: flex; flex-direction: column; }
    .item { display: flex; align-items: center; gap: 0.6rem; width: 100%; min-height: 2.4rem; padding: 0.3rem 0.5rem; border: 0; border-radius: 0.3rem; background: none; font: inherit; font-size: 0.9375rem; text-align: left; color: var(--muted); cursor: pointer; }
    .item:hover { background: oklch(93% 0.006 85); }
    .item.selected { background: oklch(93% 0.008 85); color: var(--ink); font-weight: 700; }
    .item:focus-visible { outline: 2px solid var(--ink); outline-offset: 1px; }
    .dot { flex: none; width: 0.6rem; height: 0.6rem; border-radius: 50%; background: var(--faint); }
    .item.running .dot { background: var(--ink); animation: pulse 1s ease-in-out infinite; }
    .item.survived .dot { background: var(--ok); }
    .item.failed .dot { background: var(--bad); }
    .item.incomplete .dot { background: var(--warn); }

    .stage-head { display: flex; justify-content: space-between; align-items: baseline; gap: 1rem; flex-wrap: wrap; }
    .stage-head h2 { margin: 0; font-size: 1.15rem; font-weight: 700; }
    .verdict { font: 700 0.8125rem var(--mono); letter-spacing: 0.04em; text-transform: uppercase; color: var(--muted); }
    .stage.failed .verdict { color: var(--bad); }
    .stage.survived .verdict { color: var(--ok); }
    .stage.incomplete .verdict { color: var(--warn); }

    svg { display: block; width: 100%; height: auto; margin: 0.75rem 0 0.25rem; overflow: visible; }
    .node { fill: #fff9; stroke: var(--ink); stroke-width: 1.5; }
    .node.lie { stroke: var(--bad); fill: var(--bad-tint); }
    .node.true { stroke: var(--ok); fill: var(--ok-tint); }
    .node.empty { stroke: var(--bad); stroke-dasharray: 4 3; }
    .node-label { font: 600 13px var(--mono); fill: var(--ink); text-anchor: middle; }
    .seg-ok { stroke: var(--ink); fill: var(--ink); }
    .seg-bad { stroke: var(--bad); fill: var(--bad); }
    .seg-slow { stroke: var(--warn); fill: var(--warn); }
    .seg-off { stroke: var(--faint); fill: var(--faint); }
    .seg-cut { stroke: var(--faint); fill: var(--faint); }
    .wire { stroke-width: 2; stroke-linecap: round; }
    .off { stroke-dasharray: 3 4; }
    .x { stroke: var(--bad); stroke-width: 2.5; stroke-linecap: round; fill: none; }
    .tag { font: 700 11px var(--mono); fill: var(--bad); text-anchor: middle; }
    .tag.slow { fill: var(--warn); }
    .packet { fill: var(--ink); animation: travel 1.6s ease-in-out infinite; }

    .readouts { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin-top: 0.5rem; }
    .label { margin-bottom: 0.3rem; font: 700 0.6875rem var(--mono); letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); }
    .value { min-height: 2.6rem; font-size: 1.0625rem; line-height: 1.3; font-weight: 600; overflow-wrap: anywhere; }
    .value.mono { font: 0.875rem/1.4 var(--mono); font-weight: 400; color: var(--muted); }
    .value.big { font-size: 2rem; line-height: 1; font-weight: 700; font-variant-numeric: tabular-nums; }
    .value.big small { margin-left: 0.4rem; font-size: 0.9375rem; font-weight: 400; color: var(--muted); }
    .stage.failed .col.page .value, .stage.failed .col.truth .value.big { color: var(--bad); }
    .stage.survived .col.truth .value.big { color: var(--ok); }
    .sub { display: block; margin-top: 0.25rem; font: 0.8125rem var(--mono); font-weight: 400; color: var(--muted); }

    .now { margin-top: 1.1rem; min-height: 1.4em; font: 0.8125rem var(--mono); color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .now.fault { color: var(--bad); font-weight: 700; }

    button.again { margin-left: 0.6rem; padding: 0.15rem 0.6rem; font: inherit; font-size: 0.75rem; color: var(--ink); background: transparent; border: 1px solid var(--ink); border-radius: 0.3rem; cursor: pointer; }
    button.again:hover { background: var(--ink); color: var(--bg); }
    button.again:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }

    @keyframes pulse { 0%, 100% { opacity: 0.25; } 50% { opacity: 1; } }
    @keyframes travel { 0% { transform: translateX(0); opacity: 1; } 85% { opacity: 1; } 100% { transform: translateX(280px); opacity: 0; } }
    @media (prefers-reduced-motion: reduce) { .item.running .dot, .packet { animation: none; } }
    @media (max-width: 720px) {
      h1 { margin: 1.1rem 0 1rem; font-size: 1.6rem; }
      .bar { flex-direction: column; align-items: flex-start; gap: 0.25rem; }
      .layout { grid-template-columns: 1fr; gap: 1rem; }
      .list { display: grid; grid-template-columns: 1fr 1fr; gap: 0.15rem 0.5rem; }
      .readouts { grid-template-columns: 1fr; gap: 0.75rem; }
      .value { min-height: 0; }
      .node-label { font-size: 19px; }
      .tag { font-size: 15px; }
    }
  </style>
</head>
<body>
  <main>
    <div class="bar"><strong>chaos-kane</strong><span><span id="target"></span><span id="mode"></span></span></div>
    <h1 id="headline">Waiting for a run</h1>

    <div class="layout">
      <nav class="list" id="list" aria-label="Scenarios"></nav>
      <section class="stage" id="stage" aria-live="polite">
        <div class="stage-head"><h2 id="stageTitle">Nothing running yet</h2><span class="verdict" id="verdict"></span></div>
        <svg id="wire" viewBox="0 0 600 96" role="img" aria-label="Path of the request from browser to proxy to backend"></svg>
        <div class="readouts">
          <div class="col page"><div class="label">Page said</div><div class="value" id="said"></div></div>
          <div class="col"><div class="label">Proxy did</div><div class="value mono" id="proxyNote"></div></div>
          <div class="col truth"><div class="label">Backend saved</div><div class="value big" id="count"></div></div>
        </div>
        <div class="now" id="now"></div>
      </section>
    </div>
  </main>
  <script>
    (function () {
      var NS = 'http://www.w3.org/2000/svg';
      var TITLES = {
        none: 'Healthy API', error500: 'Server error', slow: 'Slow server', timeout: 'No answer',
        garbage: 'HTML, not JSON', empty: 'Empty reply', reset: 'Dropped', ghost: 'Reply lost'
      };
      var NOTES = {
        none: 'passed everything through', error500: 'answered 500, never asked the backend',
        slow: 'held the reply for 6 seconds', timeout: 'never answered',
        garbage: 'answered 200 with an HTML page', empty: 'answered 200 with nothing',
        reset: 'cut the connection', ghost: 'let the backend save it, then lost the reply'
      };
      var WIRES = {
        none:     { a: 'ok',  b: 'ok',   c: 'ok',   d: 'ok' },
        error500: { a: 'ok',  b: 'off',  c: 'off',  d: 'bad', tag: ['d', '500'] },
        slow:     { a: 'ok',  b: 'slow', c: 'slow', d: 'ok',  tag: ['b', '6s'] },
        timeout:  { a: 'ok',  b: 'off',  c: 'off',  d: 'off', tag: ['d', 'silence'] },
        garbage:  { a: 'ok',  b: 'off',  c: 'off',  d: 'bad', tag: ['d', 'html'] },
        empty:    { a: 'ok',  b: 'off',  c: 'off',  d: 'bad', tag: ['d', 'empty'] },
        reset:    { a: 'cut', b: 'off',  c: 'off',  d: 'off' },
        ghost:    { a: 'ok',  b: 'ok',   c: 'ok',   d: 'cut' }
      };
      // a: browser to proxy, b: proxy to backend (requests, top lane); c: backend to proxy, d: proxy to browser (replies, bottom lane)
      var GEOM = {
        a: { x1: 160, x2: 240, y: 36, dir: 1 }, b: { x1: 360, x2: 440, y: 36, dir: 1 },
        c: { x1: 440, x2: 360, y: 56, dir: -1 }, d: { x1: 240, x2: 160, y: 56, dir: -1 }
      };
      var list = document.getElementById('list');
      var wire = document.getElementById('wire');
      var nowEl = document.getElementById('now');
      var headlineEl = document.getElementById('headline');
      var targetEl = document.getElementById('target');
      var modeEl = document.getElementById('mode');
      var stageEl = document.getElementById('stage');
      var els = {};
      ['stageTitle', 'verdict', 'said', 'proxyNote', 'count'].forEach(function (id) { els[id] = document.getElementById(id); });

      var data = {};
      var order = [];
      var noun = 'record';
      var latest = null;
      var pinned = null;
      var hashPin = location.hash.indexOf('#s=') === 0 ? location.hash.slice(3) : null;
      var timer = null;

      function make(tag, cls, text) {
        var el = document.createElement(tag);
        if (cls) { el.className = cls; }
        if (text !== undefined) { el.textContent = text; }
        return el;
      }
      function svg(tag, attrs, parent) {
        var el = document.createElementNS(NS, tag);
        Object.keys(attrs).forEach(function (key) { el.setAttribute(key, attrs[key]); });
        if (parent) { parent.appendChild(el); }
        return el;
      }
      function title(scenario) { return TITLES[scenario] || scenario; }
      function say(text, kind) { nowEl.textContent = text; nowEl.className = 'now' + (kind ? ' ' + kind : ''); }

      function reset() {
        data = {}; order = []; latest = null; pinned = null;
        list.textContent = '';
        headlineEl.className = '';
        headlineEl.textContent = 'Waiting for a run';
        say('', '');
        render();
      }

      function verdictOf(result) {
        var why = (result.reasons || []).join(' ');
        if (result.outcome === 'survived') { return 'honest'; }
        if (result.outcome === 'incomplete') { return 'no data'; }
        if (why.indexOf('fake success') !== -1) { return '\\u2260 fake success'; }
        if (why.indexOf('duplicate') !== -1) { return '\\u2260 duplicate'; }
        return 'no error shown';
      }

      function arrow(g, cls, parent) {
        var tip = g.x2;
        var back = g.x2 - g.dir * 7;
        svg('polygon', { points: back + ',' + (g.y - 4) + ' ' + tip + ',' + g.y + ' ' + back + ',' + (g.y + 4), 'class': cls }, parent);
      }

      function drawWire(scenario, item) {
        var spec = WIRES[scenario] || WIRES.none;
        var result = item.result;
        wire.textContent = '';
        var count = result ? (result.orderCount === undefined ? (result.orderCreated ? 1 : 0) : result.orderCount) : null;
        var lie = result && result.outcome === 'failed';
        var honest = result && result.outcome === 'survived';
        var nodes = [[100, 'browser', lie ? 'lie' : (honest ? 'true' : '')], [300, 'proxy', ''], [500, 'backend', count === null ? '' : (count > 0 ? 'true' : 'empty')]];
        nodes.forEach(function (n) {
          svg('rect', { x: n[0] - 60, y: 16, width: 120, height: 60, rx: 6, 'class': 'node ' + n[2] }, wire);
          var label = svg('text', { x: n[0], y: 51, 'class': 'node-label' }, wire);
          label.textContent = n[1];
        });
        ['a', 'b', 'c', 'd'].forEach(function (key) {
          var state = spec[key];
          var g = GEOM[key];
          var cls = 'seg-' + state;
          var line = svg('line', { x1: g.x1, y1: g.y, x2: g.x2, y2: g.y, 'class': 'wire ' + cls + (state === 'off' || state === 'cut' ? ' off' : '') }, wire);
          if (state !== 'off' && state !== 'cut') { arrow(g, cls, wire); }
          if (state === 'cut') {
            var mx = (g.x1 + g.x2) / 2;
            svg('path', { d: 'M' + (mx - 6) + ',' + (g.y - 6) + ' L' + (mx + 6) + ',' + (g.y + 6) + ' M' + (mx + 6) + ',' + (g.y - 6) + ' L' + (mx - 6) + ',' + (g.y + 6), 'class': 'x' }, wire);
          }
        });
        if (spec.tag) {
          var g2 = GEOM[spec.tag[0]];
          var tag = svg('text', { x: (g2.x1 + g2.x2) / 2, y: g2.y + 17, 'class': 'tag' + (spec.tag[1] === '6s' ? ' slow' : '') }, wire);
          tag.textContent = spec.tag[1];
        }
        if (item.status === 'running') {
          svg('circle', { cx: 160, cy: 36, r: 4, 'class': 'packet' }, wire);
        }
      }

      function ensureItem(scenario) {
        if (data[scenario]) { return data[scenario]; }
        var button = make('button', 'item');
        button.type = 'button';
        button.appendChild(make('span', 'dot'));
        button.appendChild(make('span', '', title(scenario)));
        button.onclick = function () { pinned = scenario; render(); };
        list.appendChild(button);
        data[scenario] = { button: button, status: 'waiting', result: null };
        order.push(scenario);
        return data[scenario];
      }

      function render() {
        var name = pinned || hashPin || latest;
        order.forEach(function (scenario) {
          var item = data[scenario];
          item.button.className = 'item ' + item.status + (scenario === name ? ' selected' : '');
        });
        if (!name || !data[name]) {
          stageEl.className = 'stage';
          return;
        }
        var item = data[name];
        els.stageTitle.textContent = title(name);
        drawWire(name, item);
        els.proxyNote.textContent = NOTES[name] || '';
        if (item.result) {
          var result = item.result;
          var count = result.orderCount === undefined ? (result.orderCreated ? 1 : 0) : result.orderCount;
          stageEl.className = 'stage ' + result.outcome;
          els.verdict.textContent = verdictOf(result);
          els.said.textContent = result.statusMessage === undefined ? 'nothing' : '\\u201C' + result.statusMessage + '\\u201D';
          var status = String(result.requestStatus === undefined ? '' : result.requestStatus);
          if (status !== '') {
            els.said.appendChild(make('span', 'sub', status.length === 3 && !isNaN(Number(status)) ? 'request: HTTP ' + status : 'request: ' + status));
          }
          els.count.textContent = String(count);
          els.count.appendChild(make('small', '', noun + (count === 1 ? '' : 's')));
        } else {
          stageEl.className = 'stage';
          els.verdict.textContent = item.status === 'running' ? 'kane is on it' : '';
          els.said.textContent = item.status === 'running' ? '...' : '';
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
          event.scenarios.forEach(ensureItem);
        } else if (event.type === 'scenario_start') {
          item = ensureItem(event.scenario);
          item.status = 'running';
          latest = event.scenario;
          headlineEl.textContent = 'Running: ' + title(event.scenario);
          say('Kane starts', '');
        } else if (event.type === 'fault') {
          say('fault: ' + event.action, 'fault');
        } else if (event.type === 'kane_line') {
          say('Kane: ' + event.text, '');
        } else if (event.type === 'scenario_result') {
          item = ensureItem(event.scenario);
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
