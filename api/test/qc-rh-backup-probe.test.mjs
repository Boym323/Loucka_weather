import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,chmodSync,writeFileSync,readFileSync,
  lstatSync,symlinkSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';

const script='scripts/qc-rh-backup-probe.mjs';
const run=(argv)=>spawnSync(process.execPath,[script,...argv],
  {cwd:process.cwd(),env:{},encoding:'utf8',timeout:10000});
function fixture(t){
 const base=mkdtempSync(join(tmpdir(),'loucka-backup-probe-'));
 t.after(()=>rmSync(base,{recursive:true,force:true}));
 const root=join(base,'weather'),dest=join(base,'qc');
 mkdirSync(root);mkdirSync(dest);chmodSync(dest,0o700);
 const sqlite=join(root,'station_2022.sdb');
 const sql=join(root,'weather_archive_2022.sql');
 const gzip=join(root,'weather_backup_2022.tar.gz');
 const unknown=join(root,'station_unknown_2022.db');
 writeFileSync(sqlite,Buffer.concat([
  Buffer.from('SQLite format 3\0','ascii'),Buffer.from('SECRET_001')]));
 writeFileSync(sql,Buffer.from('-- MariaDB dump\n-- PRIVATE_PASSWORD_SHOULD_NOT_ESCAPE\n'));
 writeFileSync(gzip,Buffer.from([0x1f,0x8b,0x08,0,0,0,0,0]));
 writeFileSync(unknown,Buffer.from('secret backup with unrecognized header'));
 const files=[sqlite,sql,gzip,unknown];
 function refreshInventory(paths=files,extra={}){
  const candidates=paths.map(p=>{
    const st=lstatSync(p);
    return {path:p,sizeBytes:st.size,
      modifiedUtc:new Date(st.mtimeMs).toISOString(),
      confidenceScore:5,nameCategory:'database_or_dump_name'};
  });
  const inventory={schemaVersion:'1',
    scannerVersion:'loucka-private-weather-file-inventory-v1',
    status:'complete_metadata_inventory',
    counts:{partial:false},
    roots:[{path:root,status:'accessible'}],
    candidates,safety:{databaseWrites:0,originalFileWrites:0},...extra};
  writeFileSync(join(dest,'qc-rh-2022-local-backup-inventory.json'),
    JSON.stringify(inventory),{mode:0o600});
  chmodSync(join(dest,'qc-rh-2022-local-backup-inventory.json'),0o600);
 }
 refreshInventory();
 return {root,dest,files,refreshInventory};
}
test('dry-run reads only inventory metadata, probe reads at most 512 magic bytes',t=>{
 const f=fixture(t),args=['--reports-dir',f.dest];
 const dry=run([...args,'--dry-run']);
 assert.equal(dry.status,0,dry.stderr);
 assert.equal(JSON.parse(dry.stdout).toInspect,4);
 assert.equal(JSON.parse(dry.stdout).fileContentsRead,0);
 const ok=run([...args,'--probe']);
 assert.equal(ok.status,0,ok.stderr);
 const result=JSON.parse(ok.stdout);
 assert.equal(result.status,'complete_header_probe');
 assert.equal(result.totals.inspectedFiles,4);
 assert.deepEqual(result.candidates.map(x=>x.signature),
  ['sqlite3_header','sql_text_header','gzip_header',
   'db_extension_without_sqlite_header']);
 assert.equal(result.candidates.every(x=>x.headerBytesRead<=512),true);
 assert.equal(ok.stdout.includes('PRIVATE_PASSWORD_SHOULD_NOT_ESCAPE'),false);
 assert.equal(ok.stdout.includes('SECRET_001'),false);
 const report=join(f.dest,'qc-rh-2022-backup-header-probe.json');
 assert.equal(lstatSync(report).mode&0o777,0o600);
 assert.equal(readFileSync(f.files[1],'utf8').includes('PRIVATE_PASSWORD'),true);
 assert.equal(run([...args,'--probe']).status,0);
});
test('7z magic is decoded from raw binary bytes, never lossy ASCII',t=>{
 const f=fixture(t),z=join(f.root,'weewx_2022.7z');
 writeFileSync(z,Buffer.from([0x37,0x7a,0xbc,0xaf,0x27,0x1c,0,0,0]));
 f.refreshInventory([...f.files,z]);
 const out=run(['--reports-dir',f.dest,'--probe']);
 assert.equal(out.status,0,out.stderr);
 const item=JSON.parse(out.stdout).candidates.find(x=>x.path===z);
 assert.equal(item.signature,'7zip_header');
 assert.equal(item.headerBytesRead,9);
});

test('source changes and symlinks fail closed without following either path',t=>{
 const f=fixture(t),alias=join(f.root,'station_2022_symlink.db');
 symlinkSync(f.files[0],alias);
 f.refreshInventory([...f.files,alias]);
 const changed=f.files[1];
 writeFileSync(changed,'-- MariaDB dump\nCHANGED_SINCE_INVENTORY');
 const r=run(['--reports-dir',f.dest,'--probe']);
 assert.equal(r.status,0,r.stderr);
 const res=JSON.parse(r.stdout);
 assert.equal(res.status,'partial_header_probe');
 const st=res.candidates.find(x=>x.path===changed);
 assert.equal(st.signature,'not_inspected');
 assert.equal(st.reason,'changed_since_inventory');
 const link=res.candidates.find(x=>x.path===alias);
 assert.equal(link.signature,'not_inspected');
 assert.equal(link.reason,'unsupported_or_unsafe_file');
 assert.equal(link.headerBytesRead,0);
 assert.equal(res.safety.sourceFileWrites,0);
});
test('candidate limit and unavailable roots stay explicitly partial',t=>{
 const f=fixture(t);
 f.refreshInventory(f.files,{status:'partial_metadata_inventory',
   roots:[{path:f.root,status:'accessible'},
     {path:join(f.root,'not-found'),status:'not_found'}],
   counts:{partial:true}});
 const runResult=run(['--reports-dir',f.dest,'--probe','--max-candidates','2']);
 assert.equal(runResult.status,0,runResult.stderr);
 const r=JSON.parse(runResult.stdout);
 assert.equal(r.status,'partial_header_probe');
 assert.equal(r.totals.inspectedFiles,2);
 assert.equal(r.totals.skippedByLimit,2);
 assert.notEqual(run(['--reports-dir',f.dest,'--probe','--max-candidates','2000']).status,0);
});
test('symlink output, unsafe inventory permissions and public scopes rejected',t=>{
 const f=fixture(t),args=['--reports-dir',f.dest,'--dry-run'];
 chmodSync(join(f.dest,'qc-rh-2022-local-backup-inventory.json'),0o644);
 assert.notEqual(run(args).status,0);
 chmodSync(join(f.dest,'qc-rh-2022-local-backup-inventory.json'),0o600);
 chmodSync(f.dest,0o755);
 assert.notEqual(run(args).status,0);
});
test('probe CLI passes node syntax check and never imports SQL or executes archives',()=>{
 const res=spawnSync(process.execPath,['--check',script],
  {cwd:process.cwd(),encoding:'utf8',timeout:10000});
 assert.equal(res.status,0,res.stderr);
 const source=readFileSync(new URL('../scripts/qc-rh-backup-probe.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(source,/from ['"]mariadb|child_process|execFile|spawnSync/);
});
