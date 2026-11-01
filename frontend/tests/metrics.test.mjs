import test from 'node:test';
import assert from 'node:assert/strict';
import { metrics, formatValue, getMetric } from '../src/shared/domain/metrics.ts';
import { formatTimestamp, isCurrentResponse } from '../src/shared/domain/weather.ts';

test('all display metrics have unique keys', () => {
  assert.equal(new Set(metrics.map((metric) => metric.id)).size, metrics.length);
  assert.equal(getMetric('outTemp')?.unit, '°C');
});
test('missing is not zero and observed zero remains zero', () => {
  assert.equal(formatValue(null), '—');
  assert.notEqual(formatValue(0), '—');
});
test('invalid API bodies never pass as weather', () => {
  assert.equal(isCurrentResponse({}), false);
  assert.equal(isCurrentResponse(null), false);
});
test('timestamps use Prague locale', () => {
  const stamp = formatTimestamp('2026-10-25T01:30:00Z');
  assert.match(stamp, /2026/);
});
