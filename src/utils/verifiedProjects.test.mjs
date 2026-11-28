import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prepareProjects,consumePreparedProjects,clearPreparedProjects} from './verifiedProjects.ts';
test('large record is parsed once and handed off without altering any image',()=>{const photo='data:image/jpeg;base64,'+'A'.repeat(8*1024*1024);const raw=JSON.stringify([{id:'a',floors:[],defects:[{photo}]}]);const p=prepareProjects(raw);assert.equal(prepareProjects(raw),p);assert.equal(consumePreparedProjects(raw),p);assert.equal(JSON.stringify(p),raw);assert.notEqual(prepareProjects(raw),p);clearPreparedProjects();});
test('new record or account never receives stale prepared projects',()=>{const raw=JSON.stringify([{id:'a',floors:[],defects:[]}]);const p=prepareProjects(raw);clearPreparedProjects();assert.notEqual(prepareProjects(raw),p);assert.deepEqual(consumePreparedProjects('[]'),[]);});
test('invalid or duplicate projects fail instead of becoming empty',()=>{for(const raw of ['null','{}','[{"id":"a"}]','[{"id":"a","floors":[],"defects":[]},{"id":"a","floors":[],"defects":[]}]'])assert.throws(()=>prepareProjects(raw),/Invalid projects/);clearPreparedProjects();});

import {build} from 'esbuild';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('large editable workspace survives restore, reopen, migration and account switch in Chrome', {skip:!process.env.CI}, async()=>{
 const bundle=await build({entryPoints:['src/utils/workspaceStorage.ts'],bundle:true,format:'iife',globalName:'workspace',write:false});
 async function run(){
  const key='tis_wl_projects_v10',a=crypto.randomUUID(),b=crypto.randomUUID();
  const name='tis-inspection-workspace-v2:'+a;
  const old=JSON.stringify([{id:'old',floors:[],defects:[]}]);
  const legacy=await new Promise((resolve,reject)=>{
   const req=indexedDB.open(name,1);
   req.onupgradeneeded=()=>req.result.createObjectStore('records',{keyPath:'key'}).put({key,value:old});
   req.onerror=()=>reject(req.error);req.onsuccess=()=>resolve(req.result);
  });
  legacy.close();await workspace.openWorkspace(a);
  const expected=await workspace.readSyncRecords();
  if(expected[key]!==old)throw Error('migration');
  const photo='data:image/jpeg;base64,'+'A'.repeat(512*1024);
  const projects=[133,46].map((n,p)=>({id:'p'+p,floors:[],defects:Array.from({length:n},(_,i)=>({number:i+1,beforeImg:photo,note:'ทดสอบ 📸'}))}));
  const raw=JSON.stringify(projects),report='tis_report_book_v1_p0';
  await workspace.restoreSyncRecords({[key]:raw,[report]:'{"title":"รายงาน"}'},expected,'marker');
  await workspace.closeWorkspace();await workspace.openWorkspace(a);
  const saved=await workspace.readSyncRecords();
  if(saved[key]!==raw||saved[report]!=='{"title":"รายงาน"}'||workspace.workspaceStorage.getItem('tis_drive_sync_marker_v1')!=='marker')throw Error('incomplete restored workspace');
  await workspace.restoreSyncRecords({[key]:old},saved,'updated');
  await workspace.closeWorkspace();await workspace.openWorkspace(a);
  if((await workspace.readSyncRecords())[key]!==old||workspace.workspaceStorage.getItem(report)!==null)throw Error('stale data');
  await workspace.closeWorkspace();await workspace.openWorkspace(b);
  if((await workspace.readSyncRecords())[key]!=='[]')throw Error('account isolation');
  await workspace.closeWorkspace();
 }
 const profile=await mkdtemp(join(tmpdir(),'inspection-idb-'));
 let settle;
 const finished=new Promise(resolve=>{settle=resolve});
 const server=createServer((req,res)=>{
  if(req.url==='/result'){let body='';req.on('data',d=>body+=d);req.on('end',()=>{res.end();settle(body)});return;}
  if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');res.end(bundle.outputFiles[0].text);return;}
  res.setHeader('Content-Type','text/html');res.end('<script src="/bundle.js"></script><script>('+run.toString()+')().then(()=> "ok",e=>String(e.stack||e)).then(body=>fetch("/result",{method:"POST",body}))</script>');
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=spawn('google-chrome',['--headless','--no-sandbox','--disable-dev-shm-usage','--user-data-dir='+profile,'http://127.0.0.1:'+server.address().port],{stdio:'ignore'});
 browser.on('error',e=>settle(String(e)));browser.on('exit',code=>settle('Browser exited '+code));
 const timer=setTimeout(()=>settle('Local commit timed out'),90000);
 try{assert.equal(await finished,'ok');}finally{clearTimeout(timer);browser.kill('SIGKILL');server.closeAllConnections();server.close();await rm(profile,{force:true,recursive:true,maxRetries:4,retryDelay:150});}
});
