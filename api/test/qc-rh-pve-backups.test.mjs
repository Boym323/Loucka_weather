import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,chmodSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

const script=new URL('../scripts/qc-rh-pve-backups.sh',import.meta.url).pathname;
function setup(t){
 const dir=mkdtempSync(join(tmpdir(),'loucka-pve-backups-'));
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const bin=join(dir,'bin'),log=join(dir,'calls.txt');
 mkdirSync(bin);
 const fakePvesm=`#!/usr/bin/env bash
printf '%s\\n' "$*" >> "${log}"
case "$1" in
 status)
  printf 'Name Type Status Total Used Available %%\\n'
  printf 'local dir active 100 20 80 20%%\\n'
  printf 'pbs pbs active 500 20 480 4%%\\n'
  ;;
 list)
  printf 'Volid Format Type Size VMID\\n'
  for i in $(seq 1 85); do printf 'local:backup/vzdump-lxc-104-2022-01-%02d.tar.zst tar.zst backup 1234 104\\n' "$i"; done
  ;;
 *)
  exit 80
  ;;
esac
`;
 writeFileSync(join(bin,'pvesm'),fakePvesm.replace('${log}',log),{mode:0o755});
 writeFileSync(join(bin,'pct'),`#!/bin/sh
test "$1" = list || exit 80
printf 'VMID Status Lock Name\\n104 running - zl-dev-frontendPocasi\\n'
`,{mode:0o755});
 return {dir,log,env:{...process.env,PATH:bin+':'+process.env.PATH}};
}
test('host backup discovery calls only listing subcommands and caps output',t=>{
 const f=setup(t);
 const r=spawnSync('bash',[script,'--vmid','104'],{env:f.env,encoding:'utf8',timeout:10000});
 assert.equal(r.status,0,r.stderr);
 assert.match(r.stdout,/VMID Status/);
 assert.match(r.stdout,/local dir active/);
 assert.match(r.stdout,/pbs pbs active/);
 assert.match(r.stdout,/TRUNCATED/);
 assert.match(r.stdout,/No restore\/extract\/import\/mount/);
 const calls=readFileSync(f.log,'utf8').split('\n').filter(Boolean);
 assert.deepEqual(calls,['status --content backup',
  'list local --content backup --vmid 104',
  'list pbs --content backup --vmid 104']);
 assert.ok(!calls.some(x=>/free|prune|delete|restore|import/.test(x)));
});
test('invalid VMID and extra arguments are rejected before querying Proxmox',t=>{
 const f=setup(t);
 for(const args of [['--vmid','104;rm'],['--vmid','-1'],['--vmid'],['unexpected']]){
  const r=spawnSync('bash',[script,...args],{env:f.env,encoding:'utf8',timeout:10000});
  assert.notEqual(r.status,0);
 }
});
test('script syntax and static safety are checked',()=>{
 const res=spawnSync('bash',['-n',script],{encoding:'utf8',timeout:10000});
 assert.equal(res.status,0,res.stderr);
 const source=readFileSync(script,'utf8');
 assert.doesNotMatch(source,/\bpvesm (?:free|prune|remove|alloc|import|export)\b|\bpct (?:restore|destroy|stop|start|set|mount)\b|\bvzdump\b/);
});
