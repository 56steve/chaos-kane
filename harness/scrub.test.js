import test from 'node:test';
import assert from 'node:assert/strict';
import { scrubText } from './scrub.js';

test('home directory paths lose the user name', () => {
  const text = '{"session_dir":"/Users/jane.doe/.testmuai/kaneai/sessions/abc"}';
  assert.equal(scrubText(text), '{"session_dir":"~/.testmuai/kaneai/sessions/abc"}');
});

test('test manager share links are removed', () => {
  const text = '{"test_url":"https://test-manager.lambdatest.com/projects/01ABC/test-cases/02DEF/dashboard/share/US_TOKEN123?type=summary&agentView=true"}';
  const result = scrubText(text);
  assert.doesNotMatch(result, /test-manager/);
  assert.doesNotMatch(result, /TOKEN123/);
  assert.match(result, /"test_url":"<link removed>"/);
});

test('system temp paths are replaced', () => {
  const text = '"--user-data-dir=/private/var/folders/5v/abc123/T/kane-clean-xyz"';
  assert.equal(scrubText(text), '"--user-data-dir=<tmp>"');
});

test('output stays valid JSON per line after scrubbing', () => {
  const line = JSON.stringify({
    session_dir: '/Users/jane/.testmuai/x',
    test_url: 'https://test-manager.lambdatest.com/projects/1/share/TOKEN?x=1',
    summary: 'Order placed!',
  });
  assert.doesNotThrow(() => JSON.parse(scrubText(line)));
  assert.equal(JSON.parse(scrubText(line)).summary, 'Order placed!');
});

test('scrubbing twice changes nothing more', () => {
  const text = '{"p":"/Users/jane/a","u":"https://test-manager.lambdatest.com/x/share/T"}';
  assert.equal(scrubText(scrubText(text)), scrubText(text));
});

test('ordinary evidence is left alone', () => {
  const text = '{"status_message":"Order placed! Confirmation ORD-0001","email":"grace@example.com"}';
  assert.equal(scrubText(text), text);
});
