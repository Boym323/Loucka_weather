/** CI guardrails for the optional staging-only QC timer units. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const service=readFileSync(new URL('../../deploy/lxc/loucka-qc-batch.service',import.meta.url),'utf8');
const timer=readFileSync(new URL('../../deploy/lxc/loucka-qc-batch.timer',import.meta.url),'utf8');
const property=(content,key)=>{
  const lines=content.split('\n').filter(line=>line.startsWith(key+'='));
  assert.equal(lines.length,1,'expected exactly one '+key);
  return lines[0].slice(key.length+1);
};

test('service executes exactly one bounded original+reference QC window, not SQL writes',()=>{
  assert.equal(property(service,'Type'),'oneshot');
  assert.equal(property(service,'User'),'loucka');
  assert.equal(property(service,'Group'),'loucka');
  const cmd=property(service,'ExecStart');
  assert.ok(cmd.startsWith('/usr/bin/node /home/loucka/Loucka_weather/api/scripts/qc-batch.mjs '));
  assert.match(cmd,/--from 2009-01-01T00:00:00Z/);
  assert.match(cmd,/--to 2026-11-10T00:00:00Z/);
  assert.match(cmd,/--output-dir \/var\/lib\/loucka-qc/);
  assert.match(cmd,/--max-windows 1(?:$|\s)/);
  assert.doesNotMatch(cmd,/sh -c|bash -c|mysql|mariadb|--max-windows [2-9]/i);
  assert.equal(property(service,'EnvironmentFile'),'/etc/loucka-weather/qc.env');
  assert.match(service,/^ConditionPathExists=\/etc\/loucka-weather\/qc.env$/m);
});

test('service is nonprivileged and output directory is only writable exception',()=>{
  assert.equal(property(service,'NoNewPrivileges'),'yes');
  assert.equal(property(service,'ProtectSystem'),'strict');
  assert.equal(property(service,'ProtectHome'),'read-only');
  assert.equal(property(service,'ReadWritePaths'),'/var/lib/loucka-qc');
  assert.equal(property(service,'UMask'),'0077');
  assert.equal(property(service,'PrivateTmp'),'yes');
  assert.equal(property(service,'PrivateDevices'),'yes');
  assert.equal(property(service,'MemoryMax'),'256M');
  assert.equal(property(service,'CPUQuota'),'50%');
  assert.equal(property(service,'TimeoutStartSec'),'120s');
  assert.equal(property(service,'RestrictAddressFamilies'),'AF_UNIX AF_INET AF_INET6');
  assert.doesNotMatch(service,/Environment=(?:.*PASSWORD)|ExecStartPre|ExecStartPost|Restart=always|User=root/);
  assert.doesNotMatch(service,/\[Install\]/); // service cannot be enabled alone as a recurrent worker
});

test('timer is strictly opt-in and runs no faster than one QC week per 15 minutes',()=>{
  assert.equal(property(timer,'OnCalendar'),'*-*-* *:00/15:00');
  assert.equal(property(timer,'RandomizedDelaySec'),'120s');
  assert.equal(property(timer,'Unit'),'loucka-qc-batch.service');
  assert.equal(property(timer,'Persistent'),'true');
  assert.match(timer,/WantedBy=timers.target/);
  assert.doesNotMatch(timer,/ExecStart|OnUnitActiveSec|OnActiveSec/);
});
