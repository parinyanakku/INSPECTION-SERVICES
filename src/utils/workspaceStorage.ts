// Local-only, account-scoped inspection workspace. No network requests.
import {prepareProjects,clearPreparedProjects} from './verifiedProjects';
import {attachParts,getParts,splitString,joinParts,recordMapParts,parseParts,PART_SIZE} from './recordParts.mjs';
import {openSegmentedWorkspace,readSegmentedWorkspace,writeSegmentedWorkspace,type RecordWrite} from './segmentedWorkspace.mjs';
let db: IDBDatabase | null = null;
let cache = new Map<string,string>();
let cacheParts=new Map<string,readonly string[]>();
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
   const connection=await openSegmentedWorkspace('tis-inspection-workspace-v2:'+userId);
   db=connection;
   const records=await readSegmentedWorkspace(connection);
   cache=new Map(records.map(r=>[r.key,r.value]));
   cacheParts=new Map(records.filter(r=>r.parts).map(r=>[r.key,r.parts!]));
   syncSnapshot=null;failures=new Set();pending=Promise.resolve();queued=0;status();
 }catch(e){db?.close();db=null;cache.clear();cacheParts.clear();releaseLock?.();releaseLock=null;throw e;}
}
function rememberParts(key:string,value:string|null,parts?:readonly string[]){
 if(value===null){cache.delete(key);cacheParts.delete(key);return;}
 cache.set(key,value);
 if(parts)cacheParts.set(key,parts);else if(value.length>PART_SIZE)cacheParts.set(key,splitString(value));else cacheParts.delete(key);
}
function change(key:string,value:string|null,parts?:readonly string[]){
 const connection=db;if(!connection)throw Error('Local workspace is not open');
 const changed=(cache.get(key)??null)!==value;
 if(!changed&&!failures.has(key))return;
 if(changed&&syncKey(key))syncSnapshot=null;
 rememberParts(key,value,parts);
 const write:RecordWrite={key,value,parts:cacheParts.get(key)};
 queued++;status();
 pending=pending.then(()=>writeSegmentedWorkspace(connection,[write])).then(()=>{failures.delete(key);if(changed&&syncKey(key))window.dispatchEvent(new Event('tis-workspace-sync-change'));},()=>{failures.add(key);}).finally(()=>{queued--;status();});
}
export const workspaceStorage={
 getItem(key:string){if(!db)throw Error('Local workspace is not open');return cache.get(key)??null;},
 getParts(key:string){if(!db)throw Error('Local workspace is not open');return cacheParts.get(key);},
 setItem(key:string,value:string){change(key,String(value));},
 setParts(key:string,parts:readonly string[]){change(key,joinParts(parts),parts);},
 removeItem(key:string){change(key,null);},
};
export async function writeWorkspaceBatch(records:Record<string,string>){
 const connection=db;if(!connection)throw Error('Local workspace is not open');
 await pending;if(failures.size)throw Error('Existing local writes failed');
 const writes=Object.entries(records).map(([key,value])=>({key,value,parts:getParts(records,key)}));
 await writeSegmentedWorkspace(connection,writes);
 const changed=Object.entries(records).some(([key,value])=>syncKey(key)&&cache.get(key)!==value);
 if(changed)syncSnapshot=null;
 for(const {key,value,parts} of writes)rememberParts(key,value,parts);
 status();if(changed)window.dispatchEvent(new Event('tis-workspace-sync-change'));
}
export async function flushWorkspace(){await pending;return failures.size===0;}
export async function closeWorkspace(){
 await pending;
 clearPreparedProjects();
 if(failures.size)throw Error('บันทึกข้อมูลไม่สำเร็จ กรุณาสำรองงานก่อนออกจากระบบ');
 db?.close();db=null;cache.clear();cacheParts.clear();syncSnapshot=null;releaseLock?.();releaseLock=null;status();
}
window.addEventListener('beforeunload',e=>{if(queued||failures.size){e.preventDefault();e.returnValue='';}});

const SYNC_PROJECTS='tis_wl_projects_v10',SYNC_BRAND='tis_wl_brand_v10';
function syncKey(key:string){return key===SYNC_PROJECTS||key===SYNC_BRAND||key.startsWith('tis_report_book_v1_');}
export async function readSyncRecords():Promise<Record<string,string>>{
 if(!db||!await flushWorkspace())throw Error('Local storage not ready');
 if(syncSnapshot)return syncSnapshot;
 const records=Object.fromEntries([...cache].filter(([key])=>syncKey(key)).sort(([a],[b])=>a.localeCompare(b)));
 if(!records[SYNC_PROJECTS])records[SYNC_PROJECTS]='[]';
 for(const key of Object.keys(records)){const parts=cacheParts.get(key);if(parts)attachParts(records,key,parts);}
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
 prepareProjects(records[SYNC_PROJECTS]||'null',getParts(records,SYNC_PROJECTS));
 for(const k of keys){if(k===SYNC_PROJECTS)continue;const parts=getParts(records,k);const value=parts?parseParts(parts):JSON.parse(records[k]);if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid report data');}
 const oldKeys=[...cache.keys()].filter(syncKey),before=recordMapParts(now);
 const writes:RecordWrite[]=oldKeys.filter(k=>!Object.hasOwn(records,k)).map(key=>({key,value:null}));
 for(const [key,value] of Object.entries(records))writes.push({key,value,parts:getParts(records,key)});
 writes.push({key:'tis_drive_pre_restore_v1',value:joinParts(before),parts:before},{key:'tis_drive_sync_marker_v1',value:marker});
 await writeSegmentedWorkspace(connection,writes);
 for(const {key,value,parts} of writes)rememberParts(key,value,parts);
 syncSnapshot=null;
 status();
 window.dispatchEvent(new Event('tis-workspace-sync-change'));
}
