import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const html=await readFile(new URL('../public/r.html',import.meta.url),'utf8');
const js=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const host='https://geleptwbxjoumxyxbhqa.supabase.co';
const signed=host+'/storage/v1/object/sign/inspection-client-reports/11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222.bin?token=synthetic';
const key=webcrypto.getRandomValues(new Uint8Array(32)),iv=webcrypto.getRandomValues(new Uint8Array(12)),aes=await webcrypto.subtle.importKey('raw',key,'AES-GCM',false,['encrypt']);
const content='<html><body>รายงานทดสอบ</body></html>';
const bytes=new Uint8Array(await webcrypto.subtle.encrypt({name:'AES-GCM',iv},aes,new TextEncoder().encode(content)));
const payload=new Uint8Array(iv.length+bytes.length);payload.set(iv);payload.set(bytes,iv.length);
const fragment=Buffer.from(key).toString('base64url');
async function run(hash,respond){
 const els=Object.fromEntries(['status','stage','detail','progress','retry','report'].map(id=>[id,{hidden:id==='report'||id==='retry',textContent:'',removeAttribute(k){delete this[k];}}]));
 let blob,loaded=false;
 Object.defineProperty(els.report,'src',{configurable:true,set(v){loaded=v==='blob:synthetic';queueMicrotask(()=>this.onload?.());}});
 const context={document:{getElementById:id=>els[id],documentElement:{}},navigator:{language:'th'},location:{hash,reload(){}},crypto:webcrypto,Uint8Array,TextEncoder,TextDecoder,URLSearchParams,URL:class extends URL{static createObjectURL(b){blob=b;return 'blob:synthetic';}static revokeObjectURL(){}},Blob,atob,AbortController,Error,Promise,setTimeout,clearTimeout,fetch:respond,window:{addEventListener(){}}};
 await vm.runInNewContext(js,context);return {els,blob,loaded};
}
test('short link resolves hash, decrypts real AES-GCM bytes and loads blob without srcdoc',async()=>{let calls=0;const out=await run('#'+fragment,async (url,opts)=>{calls++;if(calls===1){assert.equal(url,host+'/functions/v1/inspection-report-resolve');assert.equal(JSON.parse(opts.body).hash,Buffer.from(await webcrypto.subtle.digest('SHA-256',key)).toString('hex'));return new Response(JSON.stringify({url:signed}));}assert.equal(url,signed);return new Response(payload,{headers:{'content-length':String(payload.length)}});});assert.equal(calls,2);assert.equal(out.els.status.hidden,true);assert.equal(out.els.report.hidden,false);assert.equal(await out.blob.text(),content);assert.equal(out.loaded,true);});
test('missing fragment never calls network and offers retry',async()=>{const out=await run('',()=>{throw Error('unexpected');});assert.equal(out.els.status.hidden,false);assert.equal(out.els.retry.hidden,false);assert.match(out.els.detail.textContent,/\(LINK\)/);});
test('expired short link and incorrect origin cannot load report',async()=>{for(const response of [new Response('',{status:404}),new Response(JSON.stringify({url:'https://example.org/'}))]){let calls=0;const out=await run('#'+fragment,async()=>{calls++;return response;});assert.equal(calls,1);assert.equal(out.els.report.hidden,true);assert.match(out.els.detail.textContent,/\(LINK\)/);}});
test('legacy links remain supported and damaged ciphertext fails closed',async()=>{const old='#'+new URLSearchParams({u:signed,k:Buffer.from(key).toString('hex')});const ok=await run(old,async()=>new Response(payload));assert.equal(await ok.blob.text(),content);const broken=payload.slice();broken[broken.length-1]^=1;const bad=await run(old,async()=>new Response(broken));assert.equal(bad.els.report.hidden,true);assert.match(bad.els.detail.textContent,/\(DECRYPT\)/);});
test('both viewer aliases use identical loader',async()=>{assert.equal(await readFile(new URL('../public/customer-report.html',import.meta.url),'utf8'),html);});

test('multipart encrypted report reassembles exact original bytes above old limit',async()=>{
 const {publishReportParts,PART_SIZE}=await import('../src/utils/customerReportParts.ts');
 const root=signed.split('/inspection-client-reports/')[1].split('?')[0],objects=new Map();
 const original=new Blob([content,new Uint8Array(45*1024*1024)]);
 const count=await publishReportParts(original,root,aes,async(p,b)=>objects.set(p,b),()=>{});
 assert.ok(count>1);assert.equal(objects.size,count+1);
 const out=await run('#'+fragment,async(url,opts)=>{
  if(url===host+'/functions/v1/inspection-report-resolve'){const p=JSON.parse(opts.body).part;const name=p===undefined?root:root.slice(0,-4)+'.part-'+String(p).padStart(3,'0')+'.bin';return new Response(JSON.stringify({url:host+'/storage/v1/object/sign/inspection-client-reports/'+name+'?token=synthetic'}));}
  const name=new URL(url).pathname.split('/inspection-client-reports/')[1];return new Response(objects.get(name));
 });
 assert.equal(out.els.status.hidden,true);assert.equal(out.blob.size,original.size);assert.equal(await out.blob.slice(0,new Blob([content]).size).text(),content);assert.deepEqual(new Uint8Array(await webcrypto.subtle.digest('SHA-256',await out.blob.arrayBuffer())),new Uint8Array(await webcrypto.subtle.digest('SHA-256',await original.arrayBuffer())));
});
