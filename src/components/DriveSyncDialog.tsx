import React,{useEffect,useRef,useState} from 'react';
import type {AppLanguage} from '../types/inspection';
import {readSyncRecords,restoreSyncRecords,workspaceStorage,flushWorkspace} from '../utils/workspaceStorage';

const SCOPE='https://www.googleapis.com/auth/drive.appdata';
const ROOT='https://www.googleapis.com/drive/v3/files';
const MARK='tis_drive_sync_marker_v1';
const CLIENT='tis_drive_client_id_v1';
type Records=Record<string,string>;
type FileMeta={id:string;appProperties?:Record<string,string>;createdTime?:string};
type Snapshot={format:'TIS_DRIVE_V1';userId:string;records:Records};
type Marker={id:string;hash:string};
type TokenClient={requestAccessToken:(options:{prompt:string})=>void};
type GIS={accounts:{oauth2:{initTokenClient:(options:{client_id:string;scope:string;callback:(response:{access_token?:string;error?:string;scope?:string})=>void;error_callback:()=>void})=>TokenClient}}};
function gis(){return (window as unknown as {google?:GIS}).google;}
function readClient(){try{return localStorage.getItem(CLIENT)||'';}catch{return '';}}
async function hash(records:Records){
 const str=JSON.stringify(Object.entries(records).sort(([a],[b])=>a.localeCompare(b)));
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(str)))).map(n=>n.toString(16).padStart(2,'0')).join('');
}
async function api(token:string,url:string,init:RequestInit={}){
 const result=await fetch(url,{...init,headers:{...init.headers,Authorization:'Bearer '+token},cache:'no-store'});
 if(!result.ok)throw Error('Google Drive HTTP '+result.status);
 return result;
}
async function files(token:string,userId:string){
 const all:FileMeta[]=[];let next='';
 do{
  const q=new URLSearchParams({spaces:'appDataFolder',q:"trashed = false and appProperties has { key='tisUser' and value='"+userId+"' }",fields:'nextPageToken,files(id,createdTime,appProperties)',pageSize:'100'});
  if(next)q.set('pageToken',next);
  const json=await (await api(token,ROOT+'?'+q)).json();
  all.push(...(json.files||[]));next=json.nextPageToken||'';
  if(all.length>1000)throw Error('Too many snapshots; contact support');
 }while(next);
 const parents=new Set(all.map(f=>f.appProperties?.parent).filter(Boolean));
 const heads=all.filter(f=>!parents.has(f.id));
 if(heads.length>1)throw Error('CONFLICT');
 if(all.length&&!heads.length)throw Error('CONFLICT');
 return heads[0];
}
async function upload(token:string,userId:string,records:Records,parent:string){
 const snapshot:Snapshot={format:'TIS_DRIVE_V1',userId,records};
 const boundary='tis_'+crypto.randomUUID().replace(/-/g,'');
 const metadata={name:'TIS workspace '+userId+'.json',parents:['appDataFolder'],mimeType:'application/json',appProperties:{tisUser:userId,parent:parent||'root'}};
 const body=new Blob(['--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n',JSON.stringify(metadata),'\r\n--'+boundary+'\r\nContent-Type: application/json\r\n\r\n',JSON.stringify(snapshot),'\r\n--'+boundary+'--\r\n']);
 const r=await api(token,'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',{method:'POST',headers:{'Content-Type':'multipart/related; boundary='+boundary},body});
 const data=await r.json();if(typeof data.id!=='string')throw Error('Upload not confirmed');return data.id as string;
}
export function DriveSyncDialog({userId,lang,onClose,onRestored}:{userId:string;lang:AppLanguage;onClose:()=>void;onRestored:()=>void}){
 const tr=(th:string,en:string)=>lang==='en'?en:th;
 const [client,setClient]=useState(readClient),[ready,setReady]=useState(!!gis()),[token,setToken]=useState(''),[busy,setBusy]=useState(false),[msg,setMsg]=useState('');
 const active=useRef(true);
 useEffect(()=>{
  active.current=true;
  let script=document.querySelector<HTMLScriptElement>('script[src="https://accounts.google.com/gsi/client"]');
  const loaded=()=>{if(active.current)setReady(!!gis());};
  const failed=()=>{if(active.current)setMsg('Google Identity Services could not load');};
  if(!gis()){
   if(!script){script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;document.head.appendChild(script);}
   script.addEventListener('load',loaded);script.addEventListener('error',failed);
  }
  return()=>{active.current=false;script?.removeEventListener('load',loaded);script?.removeEventListener('error',failed);};
 },[]);
 function connect(){
  const id=client.trim();
  if(!/^[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(id)){setMsg(tr('กรุณากรอก OAuth Client ID ที่ถูกต้อง','Enter a valid OAuth Client ID'));return;}
  if(!gis())return;
  try{localStorage.setItem(CLIENT,id);}catch{}
  setToken('');setBusy(true);setMsg('');
  try{
   gis()!.accounts.oauth2.initTokenClient({client_id:id,scope:SCOPE,callback:r=>{
    if(!active.current)return;setBusy(false);
    if(!r.access_token||r.error||!r.scope?.split(' ').includes(SCOPE)){setMsg(tr('เชื่อมต่อไม่ได้หรือไม่ได้อนุญาตสิทธิ์','Connection or permission failed'));return;}
    setToken(r.access_token);setMsg(tr('เชื่อมต่อแล้ว ยังไม่ได้ส่งไฟล์งาน','Connected. No work files sent yet.'));
   },error_callback:()=>{if(active.current){setBusy(false);setMsg(tr('ยกเลิกหรือเปิดหน้าต่าง Google ไม่สำเร็จ','Google connection cancelled or popup failed'));}}}).requestAccessToken({prompt:'select_account'});
  }catch{setBusy(false);setMsg(tr('เชื่อม Google ไม่สำเร็จ','Google connection failed'));}
 }
 async function sync(){
  if(!token||busy)return;setBusy(true);setMsg('');
  try{
   const records=await readSyncRecords(),localHash=await hash(records);
   let marker:Marker|null=null;try{marker=JSON.parse(workspaceStorage.getItem(MARK)||'null');}catch{}
   const remote=await files(token,userId);
   if(!active.current)return;
   if(!remote){
    if(marker)throw Error('CONFLICT');
    if(!window.confirm(tr('ส่งแฟ้มงาน รูปภาพ แปลน และรายงานของบัญชีนี้ไปยัง Google Drive ที่เพิ่งเลือกหรือไม่?','Send this account’s projects, photos, plans and reports to the selected Google Drive?')))return;
    const id=await upload(token,userId,records,'');
    if(!active.current)return;
    workspaceStorage.setItem(MARK,JSON.stringify({id,hash:localHash}));if(!await flushWorkspace())throw Error('Local marker save failed');
    setMsg(tr('ส่งข้อมูลครั้งแรกสำเร็จ','First upload completed'));return;
   }
   if(marker?.id===remote.id&&marker.hash===localHash){setMsg(tr('ข้อมูลตรงกันแล้ว','Already synchronized'));return;}
   if(marker?.id===remote.id){
    if(!window.confirm(tr('ส่งงานที่แก้ไขล่าสุดไปยัง Google Drive หรือไม่?','Upload your latest saved changes?')))return;
    if((await files(token,userId))?.id!==remote.id)throw Error('CONFLICT');
    const id=await upload(token,userId,records,remote.id);
    if(!active.current)return;
    workspaceStorage.setItem(MARK,JSON.stringify({id,hash:localHash}));if(!await flushWorkspace())throw Error('Local marker save failed');
    setMsg(tr('อัปโหลดข้อมูลล่าสุดแล้ว','Latest saved work uploaded'));return;
   }
   const data=await (await api(token,ROOT+'/'+encodeURIComponent(remote.id)+'?alt=media')).json() as Snapshot;
   if(data.format!=='TIS_DRIVE_V1'||data.userId!==userId||!data.records||typeof data.records!=='object')throw Error('Invalid snapshot');
   const remoteHash=await hash(data.records);
   if(!active.current)return;
   if(remoteHash===localHash){workspaceStorage.setItem(MARK,JSON.stringify({id:remote.id,hash:localHash}));if(!await flushWorkspace())throw Error('Local marker save failed');setMsg(tr('ข้อมูลตรงกันแล้ว','Already synchronized'));return;}
   const empty=JSON.parse(records.tis_wl_projects_v10||'[]').length===0&&Object.keys(records).length===1;
   if(!empty&&(!marker||marker.hash!==localHash))throw Error('CONFLICT');
   if(!window.confirm(tr('โหลดข้อมูลจาก Google Drive ลงเครื่องนี้หรือไม่? ระบบเก็บชุดข้อมูลก่อนโหลดไว้ในเครื่อง','Download the Google Drive workspace? The previous local snapshot is retained on this device.')))return;
   if((await files(token,userId))?.id!==remote.id)throw Error('CONFLICT');
   if(!active.current)return;
   await restoreSyncRecords(data.records,records,JSON.stringify({id:remote.id,hash:remoteHash}));
   if(active.current)onRestored();
  }catch(e){
   if(!active.current)return;
   const message=e instanceof Error?e.message:'Unknown error';
   if(message==='CONFLICT')setMsg(tr('พบข้อมูลคนละชุดหรือแก้ไขทั้งสองเครื่อง ระบบหยุดซิงค์เพื่อไม่เขียนทับ กรุณาสำรอง JSON และติดต่อผู้ดูแล','Different or concurrent changes detected. Sync stopped to prevent overwriting. Export JSON and contact support.'));
   else{if(message.includes('401'))setToken('');setMsg(tr('ซิงค์ไม่สำเร็จ: ','Sync failed: ')+message);}
  }finally{if(active.current)setBusy(false);}
 }
 return <div className="fixed inset-0 z-[80] bg-slate-900/60 flex items-center justify-center p-4"><section role="dialog" aria-modal="true" className="bg-white rounded-2xl p-5 max-w-lg w-full max-h-[90vh] overflow-auto space-y-4">
 <div className="flex justify-between items-center"><h2 className="font-bold text-blue-950">Google Drive Sync · {tr('ทดลอง','Beta')}</h2><button disabled={busy} onClick={onClose} className="border rounded px-3 py-1">{tr('ปิด','Close')}</button></div>
 <p className="text-sm text-slate-600">{tr('เลือกใช้ได้ตามต้องการ ไฟล์งานอยู่ในพื้นที่เฉพาะแอปบน Google Drive ของคุณ ไม่ส่งรหัสผ่านหรือ Gemini API Key และไม่ใช้พื้นที่ Supabase สำหรับรูปภาพ','Optional sync uses your Google Drive app data. Passwords and Gemini API keys are excluded. No photos are sent to Supabase.')}</p>
 <label className="block text-sm">Google OAuth Client ID<input className="w-full border rounded p-2 mt-1" value={client} disabled={busy||!!token} onChange={e=>setClient(e.target.value)} placeholder="…apps.googleusercontent.com"/></label>
 <p className="text-xs text-slate-500">{tr('ตั้ง Client ID เดียวกันทุกเครื่อง เปิด Drive API และอนุญาตโดเมนเว็บไซต์ใน Google Cloud Console','Use the same Client ID on every device. Enable Drive API and authorize the website origin in Google Cloud Console.')}</p>
 <button disabled={!ready||busy} onClick={connect} className="w-full rounded bg-blue-800 text-white p-2 disabled:opacity-50">{token?tr('เปลี่ยนบัญชี Google','Change Google account'):tr('เชื่อม Google Drive','Connect Google Drive')}</button>
 <button disabled={!token||busy} onClick={()=>void sync()} className="w-full rounded bg-emerald-700 text-white p-2 disabled:opacity-50">{busy?tr('กำลังดำเนินการ…','Working…'):tr('ซิงค์ข้อมูลที่บันทึกแล้ว','Sync saved workspace')}</button>
 {token&&<button disabled={busy} onClick={()=>{setToken('');setMsg(tr('ตัดการเชื่อมต่อในหน้านี้แล้ว','Disconnected for this dialog'));}} className="text-xs underline">{tr('ตัดการเชื่อมต่อ','Disconnect')}</button>}
 {msg&&<p role="status" className="text-sm bg-slate-100 rounded p-3 break-words">{msg}</p>}
 <p className="text-xs text-slate-500">{tr('รุ่นทดลอง: กดซิงค์เองหลังบันทึกงาน ใช้บัญชีโปรแกรมและบัญชี Google เดียวกันทั้งสองเครื่อง หากแก้ไขพร้อมกันจะหยุดแทนการเขียนทับ','Beta: sync manually after saving. Use the same app and Google accounts on both devices. Concurrent edits stop sync instead of overwriting.')}</p>
 </section></div>;
}
