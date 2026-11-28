import {test} from 'node:test';import assert from 'node:assert/strict';
import {publishReportParts,partPath,partAAD,PART_SIZE,MAX_PARTS,MANIFEST_PREFIX} from '../src/utils/customerReportParts.ts';
const path='11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222.bin';
test('parts are bounded and use a fixed report-specific path',()=>{assert.equal(partPath(path,0),path.slice(0,-4)+'.part-000.bin');assert.throws(()=>partPath(path,MAX_PARTS));assert.throws(()=>partPath('../x',0));});
test('small reports retain legacy AES payload compatibility',async()=>{const aes=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);let payload;const n=await publishReportParts(new Blob(['ไทย']),path,aes,async(p,b)=>{assert.equal(p,path);payload=b;},()=>{});assert.equal(n,0);const bytes=new Uint8Array(await payload.arrayBuffer());assert.equal(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.slice(0,12)},aes,bytes.slice(12))),'ไทย');});

test('large photo upload overlaps parts and drains started writes before cleanup',async()=>{
 const {publishLazyReport}=await import('../src/utils/customerReportParts.ts');
 const html='<body><img loading="lazy" alt="photo" src="data:image/jpeg;base64,'+'A'.repeat(4*PART_SIZE)+'"></body></html>';
 const aes=await crypto.subtle.generateKey({name:'AES-GCM',length:128},false,['encrypt']);
 let active=0,peak=0,root=false;
 await assert.rejects(publishLazyReport(html,path,aes,async p=>{
  if(p===path)root=true;
  active++;peak=Math.max(peak,active);
  try{await new Promise(resolve=>setTimeout(resolve,40));if(p===partPath(path,0))throw Error('offline');}
  finally{active--;}
 },()=>{}),/offline/);
 assert.ok(peak>1&&peak<=3);assert.equal(active,0);assert.equal(root,false);
});
