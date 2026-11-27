// Temporary, account-scoped original byte ranges. Never part of the editable workspace.
export const driveRangeBytes=4*1024*1024;
export type RangeCache={get:(start:number)=>Promise<Uint8Array|undefined>;put:(start:number,bytes:Uint8Array)=>Promise<void>};
export type PendingDriveStage={id:string;hash:string;size:number;date:string;projects:number;defects:number;baseHash:string;started:number;empty:boolean};
type StoredRange={start:number;bytes:Uint8Array};
function database(userId:string,googleId:string):Promise<IDBDatabase>{
 return new Promise((resolve,reject)=>{
  const q=indexedDB.open('tis-drive-stage-v1:'+userId+':'+googleId,1);
  q.onupgradeneeded=()=>{q.result.createObjectStore('meta');q.result.createObjectStore('chunks',{keyPath:'start'});};
  q.onerror=()=>reject(q.error);q.onblocked=()=>reject(Error('Temporary download cache blocked'));
  q.onsuccess=()=>resolve(q.result);
 });
}
function query<T>(db:IDBDatabase,store:string,fn:(s:IDBObjectStore)=>IDBRequest<T>):Promise<T>{
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(store,'readonly'),q=fn(tx.objectStore(store));
  tx.oncomplete=()=>resolve(q.result);tx.onerror=tx.onabort=()=>reject(tx.error||Error('Cache read failed'));
 });
}
function transaction(db:IDBDatabase,stores:string[],fn:(tx:IDBTransaction)=>void):Promise<void>{
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(stores,'readwrite');
  tx.oncomplete=()=>resolve();tx.onerror=tx.onabort=()=>reject(tx.error||Error('Cache write failed'));
  try{fn(tx);}catch(e){try{tx.abort();}catch{}reject(e);}
 });
}
export async function openDriveStage(userId:string,googleId:string,next?:PendingDriveStage){
 const db=await database(userId,googleId);
 try{
  let meta=await query(db,'meta',s=>s.get('current')) as PendingDriveStage|undefined;
  if(next&&(!meta||meta.id!==next.id||meta.hash!==next.hash||meta.size!==next.size||meta.baseHash!==next.baseHash||Date.now()-meta.started>86400000)){
   await transaction(db,['meta','chunks'],tx=>{tx.objectStore('chunks').clear();tx.objectStore('meta').put(next,'current');});
   meta=next;
  }
  if(!meta||Date.now()-meta.started>86400000){db.close();return null;}
  const current=meta;
  const ranges:RangeCache={
   async get(start){const q=await query(db,'chunks',s=>s.get(start)) as StoredRange|undefined;return q?.bytes;},
   async put(start,bytes){await transaction(db,['chunks'],tx=>{tx.objectStore('chunks').put({start,bytes});});}
  };
  return {meta:current,ranges,complete:async()=>await query(db,'chunks',s=>s.count())===Math.ceil(current.size/driveRangeBytes),close:()=>db.close(),discard:()=>transaction(db,['meta','chunks'],tx=>{tx.objectStore('meta').clear();tx.objectStore('chunks').clear();})};
 }catch(e){db.close();throw e;}
}
