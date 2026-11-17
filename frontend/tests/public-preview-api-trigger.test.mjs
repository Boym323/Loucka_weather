import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('public staging visual smoke is triggered by backend and frontend pushes',async()=>{
 const workflow=await readFile(new URL('../../.github/workflows/preview-visual-smoke.yml',import.meta.url),'utf8');
 assert.match(workflow,/push:/);
 assert.match(workflow,/branches: \[main\]/);
 assert.match(workflow,/- "frontend\/\*\*"/);
 assert.match(workflow,/- "api\/\*\*"/);
 assert.match(workflow,/- "\.github\/workflows\/preview-visual-smoke\.yml"/);
 assert.match(workflow,/LOUCKA_EXPECT_COMMIT:/);
 assert.match(workflow,/\$\{\{ github\.event_name == 'push' && github\.sha \|\| '' \}\}/);
 assert.match(workflow,/Verify public GW3000 live painting and browser-only archival failover/);
});
