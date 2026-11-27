import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {webkit} from 'playwright';
import assert from 'node:assert/strict';
// Synthetic work only. No customer records, credentials, or Drive writes.
const server=createServer(async(req,res)=>{try{const path=req.url==='/'?null:req.url.slice(1);if(path&&!['recordParts.mjs','segmentedWorkspace.mjs'].includes(path)){res.writeHead(404).end();return;}res.setHeader('Content-Type',path?'application/javascript':'text/html');res.end(path?await readFile('src/utils/'+path):'<!doctype html><meta charset="utf-8">');}catch{res.writeHead(500).end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
 browser=await webkit.launch({headless:true});const page=await browser.newPage();
 await page.goto('http://127.0.0.1:'+server.address().port);
 const result=await page.evaluate(async()=>{
  const {parseParts,joinParts,serializeParts}=await import('/recordParts.mjs');
  const {openSegmentedWorkspace,readSegmentedWorkspace,writeSegmentedWorkspace}=await import('/segmentedWorkspace.mjs');
  const dbName='tis-test-'+crypto.randomUUID();
  const old=await new Promise((resolve,reject)=>{const q=indexedDB.open(dbName,1);q.onupgradeneeded=()=>q.result.createObjectStore('records',{keyPath:'key'});q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
  await new Promise((resolve,reject)=>{const tx=old.transaction('records','readwrite');tx.objectStore('records').put({key:'legacy',value:'existing'});tx.oncomplete=resolve;tx.onabort=reject;});old.close();
  let db=await openSegmentedWorkspace(dbName);if((await readSegmentedWorkspace(db))[0].value!=='existing')throw Error('migration');
  const photo='data:image/jpeg;base64,'+'A'.repeat(1024*1024);
  const projects=[{id:'a',floors:[],defects:Array.from({length:133},(_,i)=>({id:'a'+i,photo,note:'ไทย 📷'}))},{id:'b',floors:[],defects:Array.from({length:46},(_,i)=>({id:'b'+i,photo}))}];
  const parts=serializeParts(projects),raw=joinParts(parts);
  await writeSegmentedWorkspace(db,[{key:'projects',value:raw,parts},{key:'marker',value:'verified'}]);
  db.close();db=await openSegmentedWorkspace(dbName);
  const saved=await readSegmentedWorkspace(db),item=saved.find(x=>x.key==='projects');
  const restored=parseParts(item.parts);
  if(restored.length!==2||restored.reduce((n,p)=>n+p.defects.length,0)!==179||restored.some(p=>p.defects.some(d=>d.photo!==photo)))throw Error('counts or original image mismatch');
  if(item.value!==raw)throw Error('original record mismatch');
  try{await writeSegmentedWorkspace(db,[{key:'legacy',value:'changed'},{key:'projects',value:raw,parts:['wrong']}]);throw Error('expected abort');}catch(e){if(e.message==='expected abort')throw e;}
  const after=await readSegmentedWorkspace(db);if(after.find(x=>x.key==='legacy').value!=='existing'||after.find(x=>x.key==='projects').value!==raw)throw Error('atomic rollback');
  await writeSegmentedWorkspace(db,[{key:'projects',value:'[]'}]);if((await readSegmentedWorkspace(db)).find(x=>x.key==='projects').value!=='[]')throw Error('replacement');
  db.close();indexedDB.deleteDatabase(dbName);return {projects:2,defects:179,bytes:raw.length,rollback:true,exact:true,migration:true};
 });
 assert.equal(result.exact,true);assert.equal(result.defects,179);assert.equal(result.rollback,true);console.log(result);
}finally{await browser?.close();server.close();}
