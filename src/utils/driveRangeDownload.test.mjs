import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {downloadDriveRevision} from './driveRangeDownload.ts';
import {originalBackupBlob,streamOriginal} from './driveStreamOriginal.ts';
import {hashWorkspaceRecords} from './driveRecordHash.ts';
import {retryDriveRead} from './driveRetry.mjs';

const signal = new AbortController().signal;
const projectsKey = 'tis_wl_projects_v10';
const reportKey = 'tis_report_book_v1_house';
const block = 4 * 1024 * 1024;

test('a phone receives the computer revision and its edited revision can be read back', async () => {
  const photo = 'data:image/jpeg;base64,' + 'A'.repeat(2 * block);
  const original = {
    [projectsKey]: JSON.stringify([{id:'house',floors:[],defects:[{note:'รอยร้าว',photo}]}]),
    [reportKey]: '{"title":"รายงาน"}',
    tis_wl_brand_v10: '{"name":"Inspection"}',
  };
  async function transfer(records) {
    const hash = await hashWorkspaceRecords(records);
    const entries = Object.entries(records).sort(([a],[b])=>a.localeCompare(b));
    assert.equal(hash,createHash('sha256').update(JSON.stringify(entries)).digest('hex'));
    const blob = originalBackupBlob(records,'account-one','2026-11-27',hash);
    const starts = [];
    let failed = false;
    const response = await downloadDriveRevision(blob.size, range => retryDriveRead(async () => {
      const [,start,end] = /^bytes=(\d+)-(\d+)$/.exec(range).map(Number);
      starts.push(start);
      if (start === block && !failed) {
        failed = true;
        return new Response(null,{status:500});
      }
      return new Response(blob.slice(start,end+1),{status:206,headers:{
        'Content-Range':`bytes ${start}-${end}/${blob.size}`,
      }});
    }, async()=>{}, signal), signal);
    const saved = await streamOriginal(response,signal);
    assert.deepEqual(starts,[0,block,block,2*block]);
    assert.equal(saved.userId,'account-one');
    assert.equal(saved.contentHash,await hashWorkspaceRecords(saved.records));
    assert.deepEqual({...saved.records},records);
    return saved.records;
  }
  const phone = await transfer(original);
  phone[reportKey] = '{"title":"ตรวจซ้ำ 📷"}';
  const computer = await transfer({...phone});
  assert.equal(computer[projectsKey],original[projectsKey]);
  assert.equal(computer[reportKey],phone[reportKey]);
});

test('small and older files use ordinary downloads, and a full response to Range is supported', async () => {
  for(const size of [NaN,12,block+1]){
    const full = new Response('original');
    assert.equal(await downloadDriveRevision(size,async range=>{
      assert.equal(Boolean(range),size>block);
      return full;
    },signal),full);
  }
});

test('wrong offsets, short reads and cancellation fail before restore', async () => {
  const size = block+1;
  const partial = headers=>new Response('x',{status:206,headers});
  for(const headers of [{'Content-Range':'bytes 1-1/2'},{}]){
    const response = await downloadDriveRevision(size,async()=>partial(headers),signal);
    await assert.rejects(response.arrayBuffer(),/Drive download range/);
  }
  const controller = new AbortController();
  let calls=0;
  const response=await downloadDriveRevision(size,async()=>{
    calls++;
    return new Response(new Uint8Array(block),{status:206});
  },controller.signal);
  const reader=response.body.getReader();
  await reader.read();
  controller.abort();
  await assert.rejects(reader.read(),{name:'AbortError'});
  assert.equal(calls,1);
});

test('a truncated range retries only that offset and preserves every byte', async()=>{
 const size=block+12,source=new Uint8Array(size);source[0]=11;source[block]=99;source[size-1]=42;
 const calls=[];let truncated=false;
 const response=await downloadDriveRevision(size,async range=>{
  const [,start,end]=/^bytes=(\d+)-(\d+)$/.exec(range).map(Number);calls.push(start);
  const short=start===block&&!truncated; if(short)truncated=true;
  return new Response(source.slice(start,short?end:end+1),{status:206,headers:{'Content-Range':`bytes ${start}-${end}/${size}`}});
 },signal);
 assert.deepEqual(new Uint8Array(await response.arrayBuffer()),source);
 assert.deepEqual(calls,[0,block,block]);
});
test('fast string scan retains escapes and Unicode across ranges',async()=>{
 const records={[projectsKey]:JSON.stringify([{id:'a',floors:[],defects:[{photo:'data:image/png;base64,'+'A'.repeat(block),note:'ไทย "quote" \\ slash 📷'}]}]),[reportKey]:'{"title":"รายงาน"}'};
 const hash=await hashWorkspaceRecords(records);const blob=originalBackupBlob(records,'account-one','2026-11-27',hash);
 const response=await downloadDriveRevision(blob.size,async range=>{
  const [,start,end]=/^bytes=(\d+)-(\d+)$/.exec(range).map(Number);
  return new Response(blob.slice(start,end+1),{status:206});
 },signal);
 const result=await streamOriginal(response,signal);
 assert.deepEqual({...result.records},records);assert.equal(await hashWorkspaceRecords(result.records),hash);
});

test('staged ranges survive a second read without downloading previously received bytes',async()=>{
 const size=block+17,source=new Uint8Array(size);source[0]=22;source[block]=99;
 const stored=new Map(),calls=[];
 const cache={get:async at=>stored.get(at),put:async(at,bytes)=>{stored.set(at,bytes);}};
 const request=async range=>{const [,start,end]=/^bytes=(\d+)-(\d+)$/.exec(range).map(Number);calls.push(start);return new Response(source.slice(start,end+1),{status:206});};
 const first=await downloadDriveRevision(size,request,signal,cache);
 const reader=first.body.getReader();await reader.read();await reader.cancel();
 assert.deepEqual(calls,[0]);
 const next=await downloadDriveRevision(size,request,signal,cache);
 assert.deepEqual(new Uint8Array(await next.arrayBuffer()),source);assert.deepEqual(calls,[0,block]);
 const complete=await downloadDriveRevision(size,async()=>{throw Error('must not request network');},signal,cache);
 assert.deepEqual(new Uint8Array(await complete.arrayBuffer()),source);
});
