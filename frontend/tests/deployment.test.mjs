import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDeploymentMetadata, formatDeploymentTime } from '../src/shared/domain/deployment.ts';

const valid = {
  schemaVersion: '1', branch: 'main', commit: 'a'.repeat(40),
  deployedAt: '2026-11-01T15:51:15Z'
};

test('valid deployed release can be linked', () => {
  assert.deepEqual(parseDeploymentMetadata(valid), valid);
  assert.equal(parseDeploymentMetadata(valid)?.commit.slice(0, 10), 'aaaaaaaaaa');
});

test('reject invalid or unverified deployed version', () => {
  for (const input of [
    null, {}, [], { ...valid, schemaVersion: '0' },
    { ...valid, branch: 'develop' }, { ...valid, commit: 'bad' },
    { ...valid, deployedAt: 'tomorrow' }, { ...valid, deployedAt: null }
  ]) assert.equal(parseDeploymentMetadata(input), null);
});

test('format deployed time in Europe/Prague', () => {
  assert.match(formatDeploymentTime('2026-11-01T15:51:15Z'), /16:51/);
  assert.match(formatDeploymentTime('2026-07-01T12:00:00Z'), /14:00/);
});
