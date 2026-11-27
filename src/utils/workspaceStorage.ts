// Local-only, account-scoped inspection workspace. No network requests.
type RecordValue = { key:string; value:string };
let db: IDBDatabase | null = null;
let cache = new Map<string,string>();
let syncSnapshot: Readonly<Record<string,string>> | null = null;
let pending: Promise<void> = Promise.resolve();
let queued = 0;
let failures = new Set<string>();
let releaseLock: (()=>void) | null = null;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function status(){ window.dispatchEvent(new Event('tis-workspace-storage')); }
export function workspaceStatus(){return {pending:queued>0,failed:failures.size>0};}
export async function openWorkspace(userId:string){
 if(!UUID.test(userId))throw Error('Invalid account');
 if(db)throw Error('Workspace already open');
 if(!navigator.locks)throw Error('กรุณาใช้เบราว์เซอร์รุ่นล่าสุดที่รองรับ Web Locks');
 // One editing tab per account avoids overwriting another tab's local work.
 await new Promise<void>((resolve,reject)=>{
   void navigator.locks.request('tis-workspace-v2:'+userId,{ifAvailable:true},lock=>{
     if(!lock){reject(Error('บัญชีนี้เปิดงานอยู่ในแท็บอื่น กรุณาปิดแท็บนั้นก่อน'));return;}
     return new Promise<void>(release=>{releaseLock=release;resolve();});
   }).catch(reject);
 });
 try {
   const connection=await new Promise<IDBDatabase>((resolve,reject)=>{
     const request=indexedDB.open('tis-inspection-workspace-v2:'+userId,1);
     request.onupgradeneeded=()=>{request.result.createObjectStore('records',{keyPath:'key'});};
     request.onerror=()=>reject(request.error||Error('Cannot open local workspace'));
     request.onblocked=()=>reject(Error('Local workspace is blocked by another tab'));
     request.onsuccess=()=>resolve(request.result);
   });
   db=connection;
   const records=await new Promise<RecordValue[]>((resolve,reject)=>{
     const tx=connection.transaction('records','readonly'),req=tx.objectStore('records').getAll();
     tx.oncomplete=()=>resolve(req.result as RecordValue[]);
     tx.onabort=tx.onerror=()=>reject(tx.error||Error('Cannot read local workspace'));
   });
   cache=new Map(records.map(r=>[r.key,r.value]));syncSnapshot=null;failures=new Set();pending=Promise.resolve();queued=0;status();
 }catch(e){db?.close();db=null;cache.clear();releaseLock?.();releaseLock=null;throw e;}
}
function change(key:string,value:string|null){
 const connection=db;
 if(!connection)throw Error('Local workspace is not open');
 const changed=(cache.get(key)??null)!==value;
 if(changed&&syncKey(key))syncSnapshot=null;
 if(value===null)cache.delete(key);else cache.set(key,value);
 queued++;status();
 pending=pending.then(()=>new Promise<void>((resolve,reject)=>{
   const tx=connection.transaction('records','readwrite');
   tx.oncomplete=()=>resolve();
   tx.onabort=tx.onerror=()=>reject(tx.error||Error('Local storage write failed'));
   if(value===null)tx.objectStore('records').delete(key);
   else tx.objectStore('records').put({key,value});
 })).then(()=>{failures.delete(key);if(changed&&syncKey(key))window.dispatchEvent(new Event('tis-workspace-sync-change'));},()=>{failures.add(key);}).finally(()=>{queued--;status();});
}
export const workspaceStorage={
 getItem(key:string){if(!db)throw Error('Local workspace is not open');return cache.get(key)??null;},
 setItem(key:string,value:string){change(key,String(value));},
 removeItem(key:string){change(key,null);},
};
export async function writeWorkspaceBatch(records:Record<string,string>){
 const connection=db;if(!connection)throw Error('Local workspace is not open');
 await pending;if(failures.size)throw Error('Existing local writes failed');
 // Used only before mounting the app: all legacy records and the marker commit together.
 await new Promise<void>((resolve,reject)=>{
  const tx=connection.transaction('records','readwrite');
  tx.oncomplete=()=>resolve();tx.onabort=tx.onerror=()=>reject(tx.error||Error('Legacy migration failed'));
  const objectStore=tx.objectStore('records');for(const [key,value] of Object.entries(records))objectStore.put({key,value});
 });
 const changed=Object.entries(records).some(([key,value])=>syncKey(key)&&cache.get(key)!==value);
 if(changed)syncSnapshot=null;
 for(const [key,value] of Object.entries(records))cache.set(key,value);
 status();if(changed)window.dispatchEvent(new Event('tis-workspace-sync-change'));
}
export async function flushWorkspace(){await pending;return failures.size===0;}
export async function closeWorkspace(){
 await pending;
 if(failures.size)throw Error('บันทึกข้อมูลไม่สำเร็จ กรุณาสำรองงานก่อนออกจากระบบ');
 db?.close();db=null;cache.clear();syncSnapshot=null;releaseLock?.();releaseLock=null;status();
}
window.addEventListener('beforeunload',e=>{if(queued||failures.size){e.preventDefault();e.returnValue='';}});

const SYNC_PROJECTS='tis_wl_projects_v10',SYNC_BRAND='tis_wl_brand_v10';
function syncKey(key:string){return key===SYNC_PROJECTS||key===SYNC_BRAND||key.startsWith('tis_report_book_v1_');}
export async function readSyncRecords():Promise<Record<string,string>>{
 if(!db||!await flushWorkspace())throw Error('Local storage not ready');
 if(syncSnapshot)return syncSnapshot;
 const records=Object.fromEntries([...cache].filter(([key])=>syncKey(key)).sort(([a],[b])=>a.localeCompare(b)));
 if(!records[SYNC_PROJECTS])records[SYNC_PROJECTS]='[]';
 // Reuse the verified digest and counts while polling an unchanged workspace.
 return syncSnapshot=Object.freeze(records);
}
export async function restoreSyncRecords(records:Record<string,string>,expected:Record<string,string>,marker:string){
 const connection=db;if(!connection||!await flushWorkspace()||db!==connection)throw Error('Local storage not ready');
 const now=await readSyncRecords();
 const nowKeys=Object.keys(now);
 if(nowKeys.length!==Object.keys(expected).length||nowKeys.some(k=>now[k]!==expected[k]))throw Error('Local work changed during sync');
 const keys=Object.keys(records);
 if(keys.some(k=>!syncKey(k)||typeof records[k]!=='string'))throw Error('Invalid sync records');
 {
  const projects=JSON.parse(records[SYNC_PROJECTS]||'null');
  if(!Array.isArray(projects)||projects.some(p=>!p||typeof p.id!=='string'||!Array.isArray(p.floors)||!Array.isArray(p.defects)))throw Error('Invalid projects');
 }
 for(const k of keys){if(k===SYNC_PROJECTS)continue;const value=JSON.parse(records[k]);if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid report data');}
 const oldKeys=[...cache.keys()].filter(syncKey);
 const extras={'tis_drive_pre_restore_v1':JSON.stringify(now),'tis_drive_sync_marker_v1':marker};
 await new Promise<void>((resolve,reject)=>{
  const tx=connection.transaction('records','readwrite'),store=tx.objectStore('records');
  tx.oncomplete=()=>resolve();tx.onabort=tx.onerror=()=>reject(tx.error||Error('Restore failed'));
  for(const key of oldKeys)store.delete(key);
  for(const [key,value] of Object.entries({...records,...extras}))store.put({key,value});
 });
 for(const key of oldKeys)cache.delete(key);
 for(const [key,value] of Object.entries({...records,...extras}))cache.set(key,value);
 syncSnapshot=null;
 status();
 window.dispatchEvent(new Event('tis-workspace-sync-change'));
}
