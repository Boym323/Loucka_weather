import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
test('DEV Nginx gzip is scoped to immutable Astro assets and preserves safety headers',async()=>{
 const conf=await read('../deploy/lxc/nginx-preview.conf');
 const server=conf.slice(conf.indexOf('server {'));
 const start=server.indexOf('    location /_astro/ {');
 const end=server.indexOf('    location = /deployment.json {');
 assert.ok(start>=0&&end>start,'static asset route exists before deployment route');
 const astro=server.slice(start,end);
 assert.match(astro,/gzip on;/);
 assert.match(astro,/gzip_vary on;/);
 assert.match(astro,/gzip_proxied any;/);
 assert.match(astro,/gzip_min_length 1024;/);
 assert.match(astro,/gzip_comp_level 4;/);
 assert.match(astro,/gzip_types text\/css .*application\/javascript.*image\/svg\+xml;/);
 assert.match(astro,/try_files \$uri =404;/);
 assert.match(astro,/Cache-Control "public, max-age=31536000, immutable"/);
 assert.match(astro,/X-Content-Type-Options "nosniff"/);
 const outside=server.slice(0,start)+server.slice(end);
 assert.doesNotMatch(outside,/gzip on;/,'no compression in API, HTML or deployment paths');
 assert.match(outside,/location \^~ \/api\/v1\//);
 assert.match(outside,/X-Robots-Tag "noindex, nofollow"/);
 assert.match(outside,/location = \/deployment\.json/);
});

test('DEV compression remains a manual root-owned operation, not auto-deploy',async()=>{
 const doc=await read('../deploy/lxc/README.md');
 assert.match(doc,/GitHub commit or DEV auto-sync does not install\/reload/);
 assert.match(doc,/sudo nginx -t/);
 assert.match(doc,/sudo systemctl reload nginx/);
 assert.match(doc,/Content-Encoding: gzip/);
 assert.match(doc,/Vary: Accept-Encoding/);
 assert.match(doc,/Belchertown\/WeeWX/);
});
