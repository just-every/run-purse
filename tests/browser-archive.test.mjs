import test from 'node:test';
import assert from 'node:assert/strict';
import {assertArchiveRecords} from './browser-archive.mjs';
const snapshot=(receivingDate,timezone='America/New_York')=>({business:[{timezone}],order:[{id:'synthetic-purse-archive-order',receivingDate,needDate:'2026-11-30',totalMinor:12345,issuedAt:'2026-10-20T12:00:00Z'}]});
const window=at=>({from:Date.parse(at),to:Date.parse(at)+1000});

test('Archive equality keeps every retained order field while receiving suggestions advance at installation midnight',()=>{
 const before=snapshot('2026-10-28'),after=snapshot('2026-10-29');
 const windows={before:window('2026-10-29T03:59:00Z'),after:window('2026-10-29T04:01:00Z')};
 assertArchiveRecords(before,after,['order'],windows);
 assert.equal(before.order[0].receivingDate,'2026-10-28','Comparison never mutates source evidence');
 for(const [field,value] of [['needDate','2026-12-01'],['totalMinor',12346],['issuedAt','2026-10-21T12:00:00Z']]) {
  const corrupted=structuredClone(after);corrupted.order[0][field]=value;
  assert.throws(()=>assertArchiveRecords(before,corrupted,['order'],windows),/preserved across archive restore/);
 }
 assert.throws(()=>assertArchiveRecords(before,before,['order'],windows),/current installation day/,'A frozen old suggestion still fails');
 assert.throws(()=>assertArchiveRecords(before,after,['order']),/observation window/);
});

test('Receiving suggestion checks use the configured installation timezone and allow a read that crosses midnight',()=>{
 const before=snapshot('2026-10-29','America/Los_Angeles'),after=snapshot('2026-10-30','America/Los_Angeles');
 const windows={before:window('2026-10-30T06:59:00Z'),after:{from:Date.parse('2026-10-30T06:59:59Z'),to:Date.parse('2026-10-30T07:00:01Z')}};
 assertArchiveRecords(before,after,['order'],windows);
 const wrongZone=snapshot('2026-10-30','America/Los_Angeles');
 assert.throws(()=>assertArchiveRecords(wrongZone,after,['order'],windows),/current installation day/);
});
