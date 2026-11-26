import React,{useEffect,useRef,useState} from 'react';
import type {AppLanguage} from '../types/inspection';
import {mirrorWorkspace} from '../utils/driveVisibleBackup';
import {readSyncRecords,restoreSyncRecords,workspaceStorage,flushWorkspace} from '../utils/workspaceStorage';

const SCOPE='https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/drive.file';
const ROOT='https://www.googleapis.com/drive/v3/files';
const MARK='tis_drive_sync_marker_v1';
// Public OAuth client identifier; never include a client secret in this web app.
const CLIENT_ID='386487455938-nda2mj55c5f3cdr8pvqmq4pu4o775fv2.apps.googleusercontent.com';
type Records=Record<string,string>;
type FileMeta={id:string;appProperties?:Record<string,string>;createdTime?:string};
type Snapshot={format:'TIS_DRIVE_V1';userId:string;records:Records};
type Marker={id:string;hash:string};
type Identity={id:string;email:string;folder?:string;lastSync?:string};
const LINK='tis_drive_link_v2';
let live:{userId:string;token:string;expires:number;identity:Identity}|null=null;
export function clearDriveSession(){live=null;}
function readLink():Identity|null{try{const v=JSON.parse(workspaceStorage.getItem(LINK)||'null');return v?.id&&v?.email?v:null;}catch{return null;}}
function validToken(userId:string){return live?.userId===userId&&live.expires>Date.now()+60000?live.token:'';}
type TokenClient={requestAccessToken:(options:{prompt:string})=>void};
type GIS={accounts:{oauth2:{initTokenClient:(options:{client_id:string;scope:string;login_hint?:string;callback:(response:{access_token?:string;error?:string;scope?:string;expires_in?:number|string})=>void;error_callback:()=>void})=>TokenClient}}};
function gis(){return (window as unknown as {google?:GIS}).google;}
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
 const [ready,setReady]=useState(!!gis()),[token,setToken]=useState(()=>validToken(userId)),[busy,setBusy]=useState(false),[msg,setMsg]=useState('');
 const [link,setLink]=useState<Identity|null>(readLink);
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
 async function saveLink(value:Identity){
   if(!active.current)return;
   workspaceStorage.setItem(LINK,JSON.stringify(value));
   if(!await flushWorkspace())throw Error('Local connection settings could not be saved');
   if(active.current){setLink(value);if(live?.userId===userId)live.identity=value;}
 }
 function connect(action:'connect'|'sync'|'download'='connect',choose=false){
  if(!gis()||busy)return;
  if(!choose&&validToken(userId)){
   const access=validToken(userId);setToken(access);
   if(action!=='connect')void sync(action==='download',access);
   return;
  }
  const remembered=readLink();
  setToken('');clearDriveSession();setBusy(true);setMsg('');
  try{
   gis()!.accounts.oauth2.initTokenClient({client_id:CLIENT_ID,scope:SCOPE,...(!choose&&remembered?{login_hint:remembered.email}:{}),callback:async r=>{
    if(!active.current)return;
    if(!r.access_token||r.error||!SCOPE.split(' ').every(scope=>r.scope?.split(' ').includes(scope))){setBusy(false);setMsg(tr('กรุณาอนุญาตสิทธิ์ Google Drive ทั้งสองรายการ','Please grant both requested Drive permissions.'));return;}
    try{
      const access=r.access_token;
      const info=await (await api(access,'https://www.googleapis.com/drive/v3/about?fields=user(permissionId,emailAddress)')).json();
      if(!active.current)return;
      const id=info.user?.permissionId,email=info.user?.emailAddress;
      if(typeof id!=='string'||typeof email!=='string'||!id||!email)throw Error('Cannot verify Google account');
      if(remembered&&remembered.id!==id){setMsg(tr('บัญชี Google ไม่ตรงกับบัญชีที่ผูกไว้ เพื่อป้องกันไฟล์ผิดบัญชี กรุณาเลือกบัญชีเดิม หรือยกเลิกการเชื่อมต่อก่อน','Google account differs from the linked account. Select the original account or disconnect first.'));return;}
      const next:Identity={...remembered,id,email};
      live={userId,token:access,expires:Date.now()+Math.max(0,Number(r.expires_in)||0)*1000,identity:next};
      await saveLink(next);if(!active.current)return;
      setToken(access);
      if(action==='connect')setMsg(tr('เชื่อมต่อ '+email+' แล้ว ยังไม่ได้ส่งไฟล์งาน','Connected to '+email+'. No work files sent yet.'));
      else await sync(action==='download',access,true);
    }catch(e){clearDriveSession();setToken('');if(active.current)setMsg(tr('เชื่อมต่อไม่สำเร็จ: ','Connection failed: ')+(e instanceof Error?e.message:String(e)));}
    finally{if(active.current)setBusy(false);}
   },error_callback:()=>{if(active.current){setBusy(false);setMsg(tr('ยกเลิกหรือเปิดหน้าต่าง Google ไม่สำเร็จ','Google connection cancelled or popup failed'));}}}).requestAccessToken({prompt:!choose&&remembered?'':'select_account'});
  }catch{setBusy(false);setMsg(tr('เชื่อม Google ไม่สำเร็จ','Google connection failed'));}
 }
 async function sync(downloadOnly=false,access=token,fromConnect=false){
  if(!access||(!fromConnect&&busy))return;
  const token=access;setBusy(true);setMsg('');
  try{
   const records=await readSyncRecords(),localHash=await hash(records);
   const localProjects=JSON.parse(records.tis_wl_projects_v10||'[]');
   const empty=Array.isArray(localProjects)&&localProjects.length===0&&!Object.keys(records).some(k=>k.startsWith('tis_report_book_v1_'));
   let marker:Marker|null=null;try{marker=JSON.parse(workspaceStorage.getItem(MARK)||'null');}catch{}
   const remote=await files(token,userId);
   if(!active.current)return;
   async function finish(confirmed:Records,message:string){
    if(!active.current)return;
    const identity=readLink();if(!identity)throw Error('Missing Google account link');
    await saveLink({...identity,lastSync:new Date().toISOString()});
    setMsg(message+' · '+tr('กำลังจัดสำเนาไฟล์ใน Drive…','Preparing visible Drive copies…'));
    try{
      const folder=await mirrorWorkspace(token,userId,confirmed,()=>active.current,(done,total)=>{if(active.current)setMsg(message+' · '+tr('สำเนารูปและไฟล์','Visible copies')+' '+done+'/'+total);});
      if(!active.current)return;
      await saveLink({...identity,folder,lastSync:new Date().toISOString()});
      if(active.current)setMsg(message+' · '+tr('สำเนาไฟล์ใน Google Drive พร้อมแล้ว','Visible Drive copies are ready'));
    }catch(e){if(active.current)setMsg(message+' · '+tr('ซิงค์หลักสำเร็จ แต่สำเนาที่มองเห็นยังไม่ครบ กดซิงค์อีกครั้ง: ','Main sync succeeded; visible backup incomplete. Sync again: ')+(e instanceof Error?e.message:String(e)));}
   }
   if(!remote){
    if(downloadOnly||empty){setMsg(tr('ไม่พบแฟ้มงานบน Google Drive ของบัญชีนี้ กรุณาตรวจสอบว่าเลือกบัญชี Google และบัญชีโปรแกรมเดียวกับเครื่องที่ส่งข้อมูลแล้ว ระบบไม่ได้ส่งข้อมูลว่างขึ้นไป','No cloud workspace found. Check that both the Google and app accounts match the device that uploaded the work. No empty workspace was uploaded.'));return;}
    if(marker)throw Error('CONFLICT');
    if(!window.confirm(tr('ส่งแฟ้มงาน รูปภาพ แปลน และรายงานของบัญชีนี้ไปยัง Google Drive ที่เพิ่งเลือกหรือไม่?','Send this account’s projects, photos, plans and reports to the selected Google Drive?')))return;
    const id=await upload(token,userId,records,'');
    if(!active.current)return;
    workspaceStorage.setItem(MARK,JSON.stringify({id,hash:localHash}));if(!await flushWorkspace())throw Error('Local marker save failed');
    await finish(records,tr('ส่งข้อมูลครั้งแรกสำเร็จ','First upload completed'));return;
   }
   if(marker?.id===remote.id&&marker.hash===localHash){await finish(records,tr('ข้อมูลตรงกันแล้ว','Already synchronized'));return;}
   if(marker?.id===remote.id&&!downloadOnly){
    if(!window.confirm(tr('ส่งงานที่แก้ไขล่าสุดไปยัง Google Drive หรือไม่?','Upload your latest saved changes?')))return;
    if((await files(token,userId))?.id!==remote.id)throw Error('CONFLICT');
    const id=await upload(token,userId,records,remote.id);
    if(!active.current)return;
    workspaceStorage.setItem(MARK,JSON.stringify({id,hash:localHash}));if(!await flushWorkspace())throw Error('Local marker save failed');
    await finish(records,tr('อัปโหลดข้อมูลล่าสุดแล้ว','Latest saved work uploaded'));return;
   }
   const data=await (await api(token,ROOT+'/'+encodeURIComponent(remote.id)+'?alt=media')).json() as Snapshot;
   if(data.format!=='TIS_DRIVE_V1'||data.userId!==userId||!data.records||typeof data.records!=='object')throw Error('Invalid snapshot');
   const remoteHash=await hash(data.records);
   if(!active.current)return;
   if(remoteHash===localHash){workspaceStorage.setItem(MARK,JSON.stringify({id:remote.id,hash:localHash}));if(!await flushWorkspace())throw Error('Local marker save failed');await finish(records,tr('ข้อมูลตรงกันแล้ว','Already synchronized'));return;}
   const remoteProjects=JSON.parse(data.records.tis_wl_projects_v10||'null');
   if(!Array.isArray(remoteProjects))throw Error('Invalid cloud projects');
   if(!empty&&(!marker||marker.hash!==localHash))throw Error('CONFLICT');
   if(!remoteProjects.length&&localProjects.length){setMsg(tr('แฟ้มบน Drive ว่าง แต่เครื่องนี้มีงาน ระบบไม่โหลดทับ','Cloud workspace is empty but this device has work. Restore stopped.'));return;}
   if(!window.confirm(tr('พบ '+remoteProjects.length+' แฟ้มโครงการบน Google Drive โหลดลงเครื่องนี้หรือไม่? ระบบเก็บชุดข้อมูลก่อนโหลดไว้ในเครื่อง','Found '+remoteProjects.length+' cloud projects. Download to this device? The previous local snapshot is retained on this device.')))return;
   if((await files(token,userId))?.id!==remote.id)throw Error('CONFLICT');
   if(!active.current)return;
   await restoreSyncRecords(data.records,records,JSON.stringify({id:remote.id,hash:remoteHash}));
   if(active.current){onRestored();await finish(data.records,tr('โหลดข้อมูลสำเร็จ '+remoteProjects.length+' แฟ้มโครงการ','Downloaded '+remoteProjects.length+' projects successfully'));}
  }catch(e){
   if(!active.current)return;
   const message=e instanceof Error?e.message:'Unknown error';
   if(message==='CONFLICT')setMsg(tr('พบข้อมูลคนละชุดหรือแก้ไขทั้งสองเครื่อง ระบบหยุดซิงค์เพื่อไม่เขียนทับ กรุณาสำรอง JSON และติดต่อผู้ดูแล','Different or concurrent changes detected. Sync stopped to prevent overwriting. Export JSON and contact support.'));
   else{if(message.includes('401')){clearDriveSession();setToken('');}setMsg(tr('ซิงค์ไม่สำเร็จ: ','Sync failed: ')+message);}
  }finally{if(active.current)setBusy(false);}
 }
 return <div className="fixed inset-0 z-[80] bg-slate-900/60 flex items-center justify-center p-4"><section role="dialog" aria-modal="true" className="bg-white rounded-2xl p-5 max-w-lg w-full max-h-[90vh] overflow-auto space-y-4">
 <div className="flex justify-between items-center"><h2 className="font-bold text-blue-950">Google Drive Sync · {tr('ทดลอง','Beta')}</h2><button disabled={busy} onClick={onClose} className="border rounded px-3 py-1">{tr('ปิด','Close')}</button></div>
 <p className="text-sm text-slate-600">{tr('ไฟล์งานซิงค์ผ่าน Google Drive ส่วนตัวของคุณ พร้อมสำเนา JSON และรูปที่เปิดดูได้ใน My Drive ไม่ส่งรหัสผ่านหรือ Gemini API Key','Sync through your own Google Drive, with visible JSON and image copies in My Drive. Passwords and Gemini API keys are excluded.')}</p>
 {link&&<div className="rounded-lg bg-emerald-50 p-3 text-sm break-all"><strong>{tr('จดจำบัญชี Google แล้ว','Google account remembered')}</strong><div>{link.email}</div>{link.lastSync&&<div className="text-xs mt-1">{tr('ซิงค์ล่าสุด: ','Last sync: ')}{new Date(link.lastSync).toLocaleString(lang==='th'?'th-TH':'en-GB')}</div>}</div>}
 {!link&&<button disabled={!ready||busy} onClick={()=>connect('connect',true)} className="w-full rounded bg-blue-800 text-white p-3 disabled:opacity-50">{tr('เชื่อม Google Drive','Connect Google Drive')}</button>}
 <button disabled={!ready||busy||!link} onClick={()=>connect('sync')} className="w-full rounded bg-emerald-700 text-white p-3 disabled:opacity-50">{busy?tr('กำลังดำเนินการ…','Working…'):tr('ซิงค์ข้อมูลล่าสุด','Sync latest workspace')}</button>
 <button disabled={!ready||busy||!link} onClick={()=>connect('download')} className="w-full rounded border border-blue-700 text-blue-800 p-3 font-semibold disabled:opacity-50">{tr('โหลดข้อมูลจาก Google Drive ลงเครื่อง','Download workspace from Google Drive')}</button>
 {link?.folder&&/^[A-Za-z0-9_-]+$/.test(link.folder)&&<a className="block text-center rounded border border-slate-300 p-3 font-semibold text-blue-800" href={'https://drive.google.com/drive/folders/'+link.folder} target="_blank" rel="noopener noreferrer">{tr('เปิดโฟลเดอร์ Google Drive','Open Google Drive folder')}</a>}
 {link&&<div className="flex justify-between gap-2"><button disabled={!ready||busy} onClick={()=>connect('connect',true)} className="text-xs underline">{tr('ยืนยันบัญชี Google ใหม่','Reconnect Google account')}</button><button disabled={busy} onClick={async()=>{if(!window.confirm(tr('ยกเลิกการจดจำบัญชีบนเครื่องนี้? ไฟล์ Drive และแฟ้มงานจะไม่ถูกลบ','Forget this Google account on this device? No Drive or local files will be deleted.')))return;clearDriveSession();setToken('');try{workspaceStorage.removeItem(LINK);if(!await flushWorkspace())throw Error('Local save failed');setLink(null);setMsg(tr('ยกเลิกการจดจำบัญชีแล้ว','Account link forgotten'));}catch(e){setMsg(String(e));}}} className="text-xs text-red-700 underline">{tr('ยกเลิกการเชื่อมต่อ','Disconnect')}</button></div>}
 {msg&&<p role="status" className="text-sm bg-slate-100 rounded p-3 break-words">{msg}</p>}
 <p className="text-xs text-slate-500">{tr('กดซิงค์หลังบันทึกงาน ใช้บัญชีเดิมทั้งสองเครื่อง หาก Google หมดอายุสิทธิ์อาจเปิดหน้าขออนุญาตอีกครั้ง สำเนาใน My Drive เป็นไฟล์สำหรับเปิดดู ไม่ใช่ต้นทางซิงค์ และเก็บรุ่นเก่าไว้','Sync after saving. Use the same accounts on both devices. Google may request authorization again when access expires. Visible copies are for viewing, not the sync source, and older copies are retained.')}</p>
 </section></div>;
}
