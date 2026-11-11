import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,chmodSync,mkdirSync,writeFileSync,readFileSync,
  readdirSync,statSync,symlinkSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

const script='scripts/qc-rh-backup-inventory.mjs';
function run(args){
 return spawnSync(process.execPath,[script,...args],{
  cwd:process.cwd(),env:{},encoding:'utf8',timeout:15000});
}
test('only inventory metadata is read, symlinks ignored and private report is 0600',t=>{
 const base=mkdtempSync(join(tmpdir(),'qc-rh-inventory-test-'));
 t.after(()=>rmSync(base,{recursive:true,force:true}));
 const root=join(base,'meteorological-backups'),dest=join(base,'private-qc');
 mkdirSync(root);mkdirSync(dest);chmodSync(dest,0o700);
 const names=['weewx_2022.sdb','station-2022.sql.gz','backup-2022.tar.gz',
  'archive.json','family.jpg','readme.txt'];
 for(const name of names)writeFileSync(join(root,name),'TEST-SOURCE-UNTOUCHED');
 mkdirSync(join(root,'.git'));
 writeFileSync(join(root,'.git','weather_2022.sdb'),'HIDDEN');
 symlinkSync(join(root,'weewx_2022.sdb'),join(root,'backup-link.sdb'));
 const args=['--reports-dir',dest,'--root',root];
 const dry=run([...args,'--dry-run']);
 assert.equal(dry.status,0,dry.stderr);
 assert.equal(JSON.parse(dry.stdout).roots[0].status,'accessible');
 assert.equal(readdirSync(dest).length,0);
 const ok=run([...args,'--scan']);
 assert.equal(ok.status,0,ok.stderr);
 const stdout=JSON.parse(ok.stdout);
 assert.equal(stdout.counts.candidateFiles,4);
 assert.equal(stdout.counts.skippedSymlinks,1);
 assert.equal(stdout.safety.originalFileWrites,0);
 const result=JSON.parse(readFileSync(join(dest,'qc-rh-2022-local-backup-inventory.json'),'utf8'));
 assert.equal(result.candidates.length,4);
 assert.equal(result.candidates.every(x=>!x.provenanceVerified&&
   x.contentInspected===false&&x.originalWeatherObservationVerified===false),true);
 assert.equal(result.candidates.some(x=>x.path.includes('.git')),false);
 assert.equal(statSync(join(dest,'qc-rh-2022-local-backup-inventory.json')).mode&0o777,0o600);
 assert.equal(readFileSync(join(root,'weewx_2022.sdb'),'utf8'),'TEST-SOURCE-UNTOUCHED');
 assert.equal(run([...args,'--scan']).status,0);
});
test('root, destination permission and bounded-depth gates fail closed',t=>{
 const dir=mkdtempSync(join(tmpdir(),'qc-rh-bounds-test-'));
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const root=join(dir,'backups'),dest=join(dir,'qc'),nested=join(root,'one','two');
 mkdirSync(root);mkdirSync(dest);chmodSync(dest,0o700);
 mkdirSync(nested,{recursive:true});
 writeFileSync(join(nested,'weather_2022.sql'),'TEST');
 const args=['--reports-dir',dest,'--root',root];
 const r=run([...args,'--scan','--max-depth','1']);
 assert.equal(r.status,0,r.stderr);
 const data=JSON.parse(readFileSync(join(dest,'qc-rh-2022-local-backup-inventory.json'),'utf8'));
 assert.equal(data.counts.candidateFiles,0);
 assert.equal(data.status,'partial_metadata_inventory');
 assert.notEqual(run([...args,'--scan','--max-entries','0']).status,0);
 assert.notEqual(run([...args,'--scan','--max-depth','10']).status,0);
 assert.notEqual(run(['--reports-dir',root,'--root',root,'--scan']).status,0);
 assert.notEqual(run(['--reports-dir',dest,'--root','/','--scan']).status,0);
 chmodSync(dest,0o755);
 assert.notEqual(run([...args,'--scan']).status,0);
});
test('missing directories are reported explicitly, not mistaken for empty backups',t=>{
 const base=mkdtempSync(join(tmpdir(),'qc-rh-missing-'));
 t.after(()=>rmSync(base,{recursive:true,force:true}));
 const dest=join(base,'private'),missing=join(base,'not-available');
 mkdirSync(dest);chmodSync(dest,0o700);
 const ok=run(['--reports-dir',dest,'--root',missing,'--scan']);
 assert.equal(ok.status,0,ok.stderr);
 const report=JSON.parse(readFileSync(join(dest,'qc-rh-2022-local-backup-inventory.json'),'utf8'));
 assert.equal(report.roots[0].status,'not_found');
 assert.equal(report.candidates.length,0);
 assert.match(report.notes.join(' '),/does not prove/);
});
test('the metadata scanner uses built-in Node modules and passes syntax check',()=>{
 const r=run(['--help']);
 assert.equal(r.status,0,r.stderr);
 const js=readFileSync(new URL('../scripts/qc-rh-backup-inventory.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(js,/from ['"]mariadb|fetch\(|http\.request|https\.request/);
 const check=spawnSync(process.execPath,['--check',script],{
  cwd:process.cwd(),encoding:'utf8',timeout:10000});
 assert.equal(check.status,0,check.stderr);
});
