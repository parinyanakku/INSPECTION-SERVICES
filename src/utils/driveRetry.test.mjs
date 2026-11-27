import {test} from 'node:test';
import assert from 'node:assert/strict';
import {retryDriveRead} from './driveRetry.mjs';
test('500 then 503 then success, exponential delay',async()=>{let n=0;const delays=[];const r=await retryDriveRead(async()=>({status:[500,503,200][n++]}),async d=>delays.push(d));assert.equal(r.status,200);assert.deepEqual(delays,[1000,2000]);});
test('auth errors never retried',async()=>{let n=0;const r=await retryDriveRead(async()=>{n++;return {status:401}},async()=>assert.fail());assert.equal(r.status,401);assert.equal(n,1);});
test('persistent error stops at four attempts',async()=>{let n=0;const r=await retryDriveRead(async()=>{n++;return {status:503}},async()=>{});assert.equal(r.status,503);assert.equal(n,4);});
test('cancel during backoff prevents another request',async()=>{const c=new AbortController();let n=0;await assert.rejects(()=>retryDriveRead(async()=>{n++;return {status:500}},async()=>c.abort(),c.signal),/CANCELLED/);assert.equal(n,1);});
test('network interruption can retry',async()=>{let n=0;const r=await retryDriveRead(async()=>{if(++n===1)throw new TypeError('network');return {status:200}},async()=>{});assert.equal(r.status,200);assert.equal(n,2);});
