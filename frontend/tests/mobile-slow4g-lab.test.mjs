import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('slow mobile lab uses isolated, bounded cold runs with no visitor instrumentation',async()=>{
 const lab=await read('scripts/mobile-slow4g-lab.mjs');
 const workflow=await read('../.github/workflows/preview-visual-smoke.yml');
 assert.match(lab,/Network\.setCacheDisabled/);
 assert.match(lab,/Network\.emulateNetworkConditions/);
 assert.match(lab,/Emulation\.setCPUThrottlingRate/);
 assert.match(lab,/viewport:\{width:390,height:844\}/);
 assert.match(lab,/repetitions=3/);
 assert.match(lab,/LOUCKA_EXPECT_COMMIT/);
 assert.match(lab,/if\(expected&&expected!==json\.commit\)/);
 assert.match(lab,/imageReady/);
 assert.match(lab,/lcpCandidateKind/);
 assert.match(lab,/lighthouseEquivalent:false/);
 assert.match(lab,/fieldWebVitals:false/);
 assert.match(lab,/slowResourceClasses/);
 assert.match(lab,/mobile-slow4g-lab\.json/);
 assert.doesNotMatch(lab,/fetch\([^;]*\/api\/v1\/(?:history|statistics|climate)\//);
 assert.match(workflow,/node scripts\/mobile-slow4g-lab\.mjs/);
});
