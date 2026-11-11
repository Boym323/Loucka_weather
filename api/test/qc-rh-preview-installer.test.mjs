import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const installer=fileURLToPath(new URL('../../deploy/lxc/install-loucka-rh-preview.sh',import.meta.url));
const source=readFileSync(installer,'utf8');

test('private RH installer keeps valid Bash syntax',()=>{
 const result=spawnSync('bash',['-n',installer],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
});

test('private RH installer disables its own service on any post-install failure',()=>{
 assert.match(source,/cleanup_failed_install\(\)\s*\{[\s\S]*?systemctl disable --now "\$UNIT"/);
 const trapAt=source.indexOf('trap cleanup_failed_install EXIT');
 const unitInstallAt=source.indexOf('install -o root -g root -m 0644');
 const serviceStartAt=source.indexOf('systemctl enable --now "$UNIT"');
 const smokeAt=source.indexOf('if [[ "$status" != 200');
 const successAt=source.indexOf('trap - EXIT\necho "READY:');
 assert.ok(trapAt>=0&&trapAt<unitInstallAt&&unitInstallAt<serviceStartAt);
 assert.ok(serviceStartAt<smokeAt&&smokeAt<successAt);
 assert.match(source,/if \[\[ "\$status" != 200[\s\S]*?exit 1\s*fi/);
 assert.doesNotMatch(source,/systemctl (?:restart|stop|disable)(?: --now)? loucka-weather-api/);
});
