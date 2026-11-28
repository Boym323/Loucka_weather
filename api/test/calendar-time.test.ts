import {test} from 'node:test';
import assert from 'node:assert/strict';
import {epoch,utcIso,localMidnight,localDateAt,nextLocalDate,hourlyBucketCount,dailyBucketCount,localDayAligned,utcHourStart} from '../src/calendar-time.js';

const at=(iso:string)=>Date.parse(iso)/1000;
test('RFC3339 parser rejects normalized impossible timestamps and preserves offsets',()=>{
 for(const input of ['2026-02-29T12:00:00Z','2024-02-30T12:00:00Z','2026-04-31T00:00:00Z','2026-01-01T24:00:00Z','2026-01-01T00:60:00Z','2026-01-01T00:00:60Z','2026-01-01T00:00:00+24:00','2026-01-01T00:00:00+01:60','2026-01-01','1969-12-31T23:59:59Z'])assert.equal(epoch(input),null,input);
 assert.equal(epoch('2024-02-29T12:00:00+01:00'),at('2024-02-29T11:00:00Z'));
 assert.equal(epoch('2026-07-01T00:00:00.999+02:00'),at('2026-06-30T22:00:00Z'));
 assert.equal(epoch('1970-01-01T00:00:00Z'),0);
 assert.equal(utcIso(0),'1970-01-01T00:00:00.000Z');
});
test('Prague local day boundaries preserve 23 and 25 hour DST days',()=>{
 for(const [day,start,end,hours] of [
  ['2026-03-29','2026-03-28T23:00:00Z','2026-03-29T22:00:00Z',23],
  ['2026-10-25','2026-10-24T22:00:00Z','2026-10-25T23:00:00Z',25],
  ['2026-11-28','2026-11-27T23:00:00Z','2026-11-28T23:00:00Z',24]
 ] as const){
  const from=at(start),to=at(end);
  assert.equal(localMidnight(day),from);
  assert.equal(localMidnight(nextLocalDate(day)),to);
  assert.equal(localDateAt(from),day);
  assert.equal(localDateAt(to-1),day);
  assert.equal(localDayAligned(from,to),true);
  assert.equal(localDayAligned(from+1,to),false);
  assert.equal(hourlyBucketCount(from,to),hours);
  assert.equal(dailyBucketCount(from,to),1);
 }
});
test('civil date validation and year transitions remain bounded',()=>{
 for(const invalid of ['2008-12-31','2102-01-01','2026-02-29','2026-13-01','2026-01-00','2026-1-01'])assert.equal(localMidnight(invalid),null);
 assert.equal(nextLocalDate('2024-02-28'),'2024-02-29');
 assert.equal(nextLocalDate('2024-02-29'),'2024-03-01');
 assert.equal(nextLocalDate('2026-12-31'),'2027-01-01');
 assert.equal(dailyBucketCount(at('2026-03-28T23:00:00Z'),at('2026-03-30T22:00:00Z')),2);
});
test('archive end time belongs to preceding UTC hour at exact boundary',()=>{
 assert.equal(utcHourStart(3600),0);
 assert.equal(utcHourStart(3601),3600);
 assert.equal(hourlyBucketCount(0,3600),1);
 assert.equal(hourlyBucketCount(3599,3601),2);
});
