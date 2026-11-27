import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createImageIndexScanner} from './driveImageIndex.mjs';
const enc=new TextEncoder(),dec=new TextDecoder();
test('UTF-8 and escaped ranges across chunks',()=>{const raw=enc.encode(JSON.stringify({name:'บ้าน 🏠',photos:['data:image/jpeg;base64,AAAA','data:image/svg+xml;charset=utf-8,<svg>"</svg>']}));for(const n of [1,2,7,13,64]){const s=createImageIndexScanner(65536);for(let i=0;i<raw.length;i+=n)s.feed(raw.subarray(i,i+n));const x=s.finish();assert.equal(JSON.parse(dec.decode(x.bytes)).name,'บ้าน 🏠');assert.equal(x.ranges.length,2);for(let i=0;i<2;i++)assert.equal(JSON.parse(dec.decode(raw.subarray(x.ranges[i].start,x.ranges[i].end+1))),JSON.parse(dec.decode(raw)).photos[i]);}});
test('179 large photos not retained in index',()=>{const s=createImageIndexScanner(1024*1024),a=enc.encode('A'.repeat(65536));s.feed(enc.encode('{"photos":['));for(let i=0;i<179;i++){s.feed(enc.encode((i?',':'')+'"data:image/jpeg;base64,'));for(let j=0;j<16;j++)s.feed(a);s.feed(enc.encode('"'));}s.feed(enc.encode(']}'));const x=s.finish();assert.ok(x.total>170*1024*1024);assert.equal(x.ranges.length,179);assert.ok(x.bytes.length<10000);});
test('rejects incomplete strings',()=>{const s=createImageIndexScanner(1024);s.feed(enc.encode('{"photo":"data:image/png;base64,AA'));assert.throws(()=>s.finish(),/Incomplete/);});
