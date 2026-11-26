// Local-only, account-scoped inspection workspace. No network requests.
type RecordValue = { key:string; value:string };
let db: IDBDatabase | null = null;
let cache = new Map<string,string>();
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
   cache=new Map(records.map(r=>[r.key,r.value]));failures=new Set();pending=Promise.resolve();queued=0;status();
 }catch(e){db?.close();db=null;cache.clear();releaseLock?.();releaseLock=null;throw e;}
}
function change(key:string,value:string|null){
 const connection=db;
 if(!connection)throw Error('Local workspace is not open');
 if(value===null)cache.delete(key);else cache.set(key,value);
 queued++;status();
 pending=pending.then(()=>new Promise<void>((resolve,reject)=>{
   const tx=connection.transaction('records','readwrite');
   tx.oncomplete=()=>resolve();
   tx.onabort=tx.onerror=()=>reject(tx.error||Error('Local storage write failed'));
   if(value===null)tx.objectStore('records').delete(key);
   else tx.objectStore('records').put({key,value});
 })).then(()=>{failures.delete(key);},()=>{failures.add(key);}).finally(()=>{queued--;status();});
}
export const workspaceStorage={
 getItem(key:string){if(!db)throw Error('Local workspace is not open');return cache.get(key)??null;},
 setItem(key:string,value:string){change(key,String(value));},
 removeItem(key:string){change(key,null);},
};
export async function flushWorkspace(){await pending;return failures.size===0;}
export async function closeWorkspace(){
 await pending;
 if(failures.size)throw Error('บันทึกข้อมูลไม่สำเร็จ กรุณาสำรองงานก่อนออกจากระบบ');
 db?.close();db=null;cache.clear();releaseLock?.();releaseLock=null;status();
}
window.addEventListener('beforeunload',e=>{if(queued||failures.size){e.preventDefault();e.returnValue='';}});
