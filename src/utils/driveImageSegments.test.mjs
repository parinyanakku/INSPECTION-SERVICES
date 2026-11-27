import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {splitImageSegments,joinImageSegments} from './driveImageSegments.mjs';
const enc=new TextEncoder();
const sha=()=>createHash('sha256');
async function run(chunks){
 const store=new Map(),original=sha();let length=0;
 async function* source(){for await(const b of chunks){original.update(b);length+=b.length;yield b;}}
 const put=kind=>async bytes=>{const id=sha().update(bytes).digest('hex');store.set(kind+id,bytes);return id;};
 const manifest=await splitImageSegments(source(),{putImage:put('image'),putText:put('text')});
 const restored=sha();let n=0;
 for await(const b of joinImageSegments(manifest,async(kind,id)=>store.get(kind+id))){restored.update(b);n+=b.length;}
 assert.equal(restored.digest('hex'),original.digest('hex'));assert.equal(n,length);
 return {manifest,length,store};
}
test('Thai, escapes, SVG, duplicate images, arbitrary UTF-8 boundaries',async()=>{
 const text=JSON.stringify({name:'บ้าน 🏠 "ไทย"',photos:['data:image/png;base64,AAAA','data:image/svg+xml;charset=utf-8,<svg>"</svg>','data:image/png;base64,AAAA'],report:{note:'abc\\def'}});
 const bytes=enc.encode(text);async function* chunks(){for(let i=0;i<bytes.length;i++)yield bytes.slice(i,i+1);}
 const {manifest}=await run(chunks());assert.equal(manifest.images,3);
});
test('179 defects, over 170 MiB, exact round trip',async()=>{
 const image='data:image/jpeg;base64,'+'A'.repeat(1024*1024);const photo=enc.encode(JSON.stringify(image));
 async function* chunks(){yield enc.encode('{"projects":[{"id":"a","defects":[');for(let i=0;i<179;i++){yield enc.encode((i?',':'')+'{"number":'+i+',"beforeImg":');for(let p=0;p<photo.length;p+=65536)yield photo.subarray(p,p+65536);yield enc.encode('}');}yield enc.encode(']}]}');}
 const {manifest,length}=await run(chunks());assert.equal(manifest.images,179);assert.ok(length>170*1024*1024);console.log('verified bytes:',length);
});
test('truncated input fails and missing segment is rejected',async()=>{
 const put=async()=> 'x';await assert.rejects(()=>splitImageSegments([enc.encode('{"photo":"data:image/png;base64,AAA')],{putText:put,putImage:put}),/Incomplete/);
 const {manifest}=await run([enc.encode('{"a":"data:image/png;base64,AAAA"}')]);await assert.rejects(async()=>{for await(const _ of joinImageSegments(manifest,async()=>undefined)){}},/Incomplete segment/);
});
