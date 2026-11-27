import React,{useEffect,useRef,useState} from 'react';
import {flushSync} from 'react-dom';
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
type Identity={id:string;email:string;folder?:string;lastSync?:string;lastExport?:string};
const LINK='tis_drive_link_v2';
const AUTO='tis_drive_auto_sync_v1';
let stopDriveOperation:(()=>void)|null=null;
function readAuto(){try{return workspaceStorage.getItem(AUTO)==='1';}catch{return false;}}
let live:{userId:string;token:string;expires:number;identity:Identity}|null=null;
export function clearDriveSession(){live=null;stopDriveOperation?.();}
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
async function files(token:string,userId:string,signal?:AbortSignal){
 const all:FileMeta[]=[];let next='';
 do{
  const q=new URLSearchParams({spaces:'appDataFolder',q:"trashed = false and appProperties has { key='tisUser' and value='"+userId+"' }",fields:'nextPageToken,files(id,createdTime,appProperties)',pageSize:'100'});
  if(next)q.set('pageToken',next);
  const json=await (await api(token,ROOT+'?'+q,{signal})).json();
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
export function DriveSyncDialog({userId,lang,visible,paused,canAutoRestore,onClose,onRestored,onOpen,onBusyChange}:{userId:string;lang:AppLanguage;visible:boolean;paused:boolean;canAutoRestore:()=>boolean;onClose:()=>void;onRestored:()=>void;onOpen:()=>void;onBusyChange:(busy:boolean)=>void}){
 const tr=(th:string,en:string)=>lang==='en'?en:th;
 const [ready,setReady]=useState(!!gis()),[,setToken]=useState(()=>validToken(userId)),[busy,setBusy]=useState(false),[msg,setMsg]=useState('');
 const [link,setLink]=useState<Identity|null>(readLink);
 const active=useRef(true);
 const [auto,setAuto]=useState(readAuto);
 const autoHold=useRef(false);
 const safeRestoreRef=useRef(canAutoRestore);safeRestoreRef.current=canAutoRestore;
 const [autoRunning,setAutoRunning]=useState(false);
 const operation=useRef<AbortController|null>(null);
 const [cancelling,setCancelling]=useState(false);
 const [applyingRestore,setApplyingRestore]=useState(false);
 useEffect(()=>{if(!busy)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[busy]);
 const check=(op:AbortController)=>{if(!active.current||operation.current!==op||op.signal.aborted)throw Error('CANCELLED');};
 function end(op:AbortController){if(operation.current!==op)return;operation.current=null;if(active.current){setBusy(false);setCancelling(false);setAutoRunning(false);}}
 function cancel(){const op=operation.current;if(!op)return;autoHold.current=true;op.abort();if(operation.current!==op)return;setCancelling(true);setMsg(tr('กำลังหยุดงานที่เหลือ… หากกำลังบันทึกชุดข้อมูล จะรอให้บันทึกเสร็จก่อน','Stopping remaining work… An in-flight workspace commit may finish first.'));}
 function cancelled(op:AbortController){if(active.current&&operation.current===op)setMsg(tr('ยกเลิกแล้ว ข้อมูลที่บันทึกและไฟล์ที่ส่งสำเร็จยังอยู่ ตรวจสอบสถานะได้โดยกดซิงค์อีกครั้ง','Cancelled. Saved work and completed files are retained. Sync again to check the latest state.'));}
 useEffect(()=>{
  active.current=true;
  const stop=()=>{operation.current?.abort();};stopDriveOperation=stop;
  return()=>{active.current=false;stop();if(stopDriveOperation===stop)stopDriveOperation=null;};
 },[]);
 useEffect(()=>{onBusyChange(busy);return()=>onBusyChange(false);},[busy,onBusyChange]);
 useEffect(()=>{
  if(!visible)return;
  let script=document.querySelector<HTMLScriptElement>('script[src="https://accounts.google.com/gsi/client"]');
  const loaded=()=>{if(active.current)setReady(!!gis());};
  const failed=()=>{if(active.current)setMsg('Google Identity Services could not load');};
  if(gis())setReady(true);
  else{
   if(!script){script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;document.head.appendChild(script);}
   script.addEventListener('load',loaded);script.addEventListener('error',failed);
  }
  return()=>{script?.removeEventListener('load',loaded);script?.removeEventListener('error',failed);};
 },[visible]);
 async function saveLink(value:Identity){
   if(!active.current)return;
   workspaceStorage.setItem(LINK,JSON.stringify(value));
   if(!await flushWorkspace())throw Error('Local connection settings could not be saved');
   if(active.current){setLink(value);if(live?.userId===userId)live.identity=value;}
 }
 function connect(action:'connect'|'sync'|'download'|'export'='connect',choose=false){
  if(!gis()||operation.current||paused)return;
  autoHold.current=false;
  const op=new AbortController();operation.current=op;setBusy(true);setCancelling(false);setMsg('');
  const run=async(access:string)=>{
   try{check(op);if(action==='export')await exportFiles(access,op);else if(action!=='connect')await sync(action==='download',access,op);}
   catch(e){handleError(e,op);}finally{end(op);}
  };
  if(!choose&&validToken(userId)){void run(validToken(userId));return;}
  const remembered=readLink();
  setToken('');live=null;
  // OAuth popup cannot be closed programmatically; cancellation ignores its late response.
  let authorizing=true;
  op.signal.addEventListener('abort',()=>{if(authorizing){cancelled(op);end(op);}},{once:true});
  try{
   gis()!.accounts.oauth2.initTokenClient({client_id:CLIENT_ID,scope:SCOPE,...(!choose&&remembered?{login_hint:remembered.email}:{}),callback:async r=>{
    if(!active.current||operation.current!==op||op.signal.aborted)return;
    authorizing=false;
    try{
      if(!r.access_token||r.error||!SCOPE.split(' ').every(scope=>r.scope?.split(' ').includes(scope)))throw Error(tr('กรุณาอนุญาตสิทธิ์ Google Drive ทั้งสองรายการ','Please grant both requested Drive permissions.'));
      const access=r.access_token;
      const info=await (await api(access,'https://www.googleapis.com/drive/v3/about?fields=user(permissionId,emailAddress)',{signal:op.signal})).json();
      check(op);
      const id=info.user?.permissionId,email=info.user?.emailAddress;
      if(typeof id!=='string'||typeof email!=='string'||!id||!email)throw Error('Cannot verify Google account');
      if(remembered&&remembered.id!==id)throw Error(tr('บัญชี Google ไม่ตรงกับบัญชีที่ผูกไว้ กรุณาเลือกบัญชีเดิม','Google account differs from the linked account. Select the original account.'));
      const next:Identity={...remembered,id,email};
      live={userId,token:access,expires:Date.now()+Math.max(0,Number(r.expires_in)||0)*1000,identity:next};
      await saveLink(next);check(op);setToken(access);
      if(action==='connect')setMsg(tr('เชื่อมต่อ '+email+' แล้ว ยังไม่ได้ส่งไฟล์งาน','Connected to '+email+'. No work files sent yet.'));
      else if(action==='export')await exportFiles(access,op);
      else await sync(action==='download',access,op);
    }catch(e){handleError(e,op);}finally{end(op);}
   },error_callback:()=>{if(active.current&&operation.current===op){setMsg(tr('ยกเลิกหรือเปิดหน้าต่าง Google ไม่สำเร็จ','Google connection cancelled or popup failed'));end(op);}}}).requestAccessToken({prompt:!choose&&remembered?'':'select_account'});
  }catch(e){handleError(e,op);end(op);}
 }
 function handleError(e:unknown,op:AbortController){
  if(!active.current||operation.current!==op)return;
  if(op.signal.aborted){cancelled(op);return;}
  const message=e instanceof Error?e.message:String(e);
  if(message==='CONFLICT'){autoHold.current=true;setMsg(tr('พบข้อมูลคนละชุดหรือแก้ไขทั้งสองเครื่อง ระบบหยุดซิงค์เพื่อไม่เขียนทับ กรุณาสำรอง JSON และติดต่อผู้ดูแล','Different or concurrent changes detected. Sync stopped to prevent overwriting. Export JSON and contact support.'));}
  else{if(message.includes('401')){live=null;setToken('');}setMsg(tr('ดำเนินการไม่สำเร็จ: ','Operation failed: ')+message);}
 }
 async function exportFiles(token:string,op:AbortController){
  const records=await readSyncRecords();check(op);
  if(!window.confirm(tr('ส่งสำเนาแฟ้มงานและรูปภาพที่บันทึกแล้วไปยัง My Drive หรือไม่?','Send visible copies of saved projects and images to My Drive?')))return;
  check(op);
  setMsg(tr('กำลังตรวจสอบไฟล์ที่เคยส่ง…','Checking existing files…'));
  const folder=await mirrorWorkspace(token,userId,records,()=>active.current&&operation.current===op&&!op.signal.aborted,(done,total)=>{if(active.current&&operation.current===op&&!op.signal.aborted)setMsg(tr('ส่งไฟล์ / ตรวจสอบแล้ว ','Exported / checked ')+done+'/'+total);},op.signal);
  check(op);
  const identity=readLink();if(!identity)throw Error('Missing Google account link');
  await saveLink({...identity,folder,lastExport:new Date().toISOString()});check(op);
  setMsg(tr('ส่งไฟล์ไป Google Drive สำเร็จ','Visible Drive export completed'));
 }
 async function sync(downloadOnly:boolean,token:string,op:AbortController,automatic=false){
  setMsg(tr('กำลังตรวจสอบข้อมูลซิงค์…','Checking sync data…'));
  {
   const records=await readSyncRecords(),localHash=await hash(records);check(op);
   const localProjects=JSON.parse(records.tis_wl_projects_v10||'[]');
   const empty=Array.isArray(localProjects)&&localProjects.length===0&&!Object.keys(records).some(k=>k.startsWith('tis_report_book_v1_'));
   let marker:Marker|null=null;try{marker=JSON.parse(workspaceStorage.getItem(MARK)||'null');}catch{}
   const remote=await files(token,userId,op.signal);check(op);
   async function finish(confirmed:Records,message:string){
    if(!active.current||operation.current!==op)return;
    const identity=readLink();if(!identity)throw Error('Missing Google account link');
    await saveLink({...identity,lastSync:new Date().toISOString()});
    if(op.signal.aborted){cancelled(op);return;}
    const count=JSON.parse(confirmed.tis_wl_projects_v10||'[]').length;
    setMsg(message+' · '+tr(count+' แฟ้มโครงการ',count+' projects'));
   }
   if(!remote){
    if(downloadOnly||empty){setMsg(tr('ไม่พบแฟ้มงานบน Google Drive ของบัญชีนี้ กรุณาตรวจสอบว่าเลือกบัญชี Google และบัญชีโปรแกรมเดียวกับเครื่องที่ส่งข้อมูลแล้ว ระบบไม่ได้ส่งข้อมูลว่างขึ้นไป','No cloud workspace found. Check that both the Google and app accounts match the device that uploaded the work. No empty workspace was uploaded.'));return;}
    if(marker)throw Error('CONFLICT');
    if(automatic){setMsg(tr('ยังไม่ได้ส่งข้อมูลครั้งแรก กรุณากดซิงค์ด้วยตนเองหนึ่งครั้ง','First upload requires one manual sync.'));return;}
    if(!window.confirm(tr('ส่งแฟ้มงาน รูปภาพ แปลน และรายงานของบัญชีนี้ไปยัง Google Drive ที่เพิ่งเลือกหรือไม่?','Send this account’s projects, photos, plans and reports to the selected Google Drive?')))return;
    check(op);const id=await upload(token,userId,records,'');
    if(!active.current)return;
    check(op);workspaceStorage.setItem(MARK,JSON.stringify({id,hash:localHash}));if(!await flushWorkspace())throw Error('Local marker save failed');
    await finish(records,tr('ส่งข้อมูลครั้งแรกสำเร็จ','First upload completed'));return;
   }
   if(marker?.id===remote.id&&marker.hash===localHash){await finish(records,tr('ข้อมูลตรงกันแล้ว','Already synchronized'));return;}
   if(marker?.id===remote.id&&!downloadOnly){
    if(!automatic&&!window.confirm(tr('ส่งงานที่แก้ไขล่าสุดไปยัง Google Drive หรือไม่?','Upload your latest saved changes?')))return;
    if((await files(token,userId,op.signal))?.id!==remote.id)throw Error('CONFLICT');check(op);
    check(op);const id=await upload(token,userId,records,remote.id);
    if(!active.current)return;
    check(op);workspaceStorage.setItem(MARK,JSON.stringify({id,hash:localHash}));if(!await flushWorkspace())throw Error('Local marker save failed');
    await finish(records,tr('อัปโหลดข้อมูลล่าสุดแล้ว','Latest saved work uploaded'));return;
   }
   const data=await (await api(token,ROOT+'/'+encodeURIComponent(remote.id)+'?alt=media',{signal:op.signal})).json() as Snapshot;
   if(data.format!=='TIS_DRIVE_V1'||data.userId!==userId||!data.records||typeof data.records!=='object')throw Error('Invalid snapshot');
   const remoteHash=await hash(data.records);check(op);
   if(remoteHash===localHash){workspaceStorage.setItem(MARK,JSON.stringify({id:remote.id,hash:localHash}));if(!await flushWorkspace())throw Error('Local marker save failed');await finish(records,tr('ข้อมูลตรงกันแล้ว','Already synchronized'));return;}
   const remoteProjects=JSON.parse(data.records.tis_wl_projects_v10||'null');
   if(!Array.isArray(remoteProjects))throw Error('Invalid cloud projects');
   if(!empty&&(!marker||marker.hash!==localHash))throw Error('CONFLICT');
   if(!remoteProjects.length&&localProjects.length){setMsg(tr('แฟ้มบน Drive ว่าง แต่เครื่องนี้มีงาน ระบบไม่โหลดทับ','Cloud workspace is empty but this device has work. Restore stopped.'));return;}
   if(!safeRestoreRef.current()){setMsg(tr('มีข้อมูลใหม่บน Drive '+remoteProjects.length+' แฟ้ม จะรับเมื่อกลับหน้าแฟ้มโครงการ','New cloud data: '+remoteProjects.length+' projects. Download deferred until the project list is idle.'));return;}
   if(!automatic&&!window.confirm(tr('พบ '+remoteProjects.length+' แฟ้มโครงการบน Google Drive โหลดลงเครื่องนี้หรือไม่? ระบบเก็บชุดข้อมูลก่อนโหลดไว้ในเครื่อง','Found '+remoteProjects.length+' cloud projects. Download to this device? The previous local snapshot is retained on this device.')))return;
   if((await files(token,userId,op.signal))?.id!==remote.id)throw Error('CONFLICT');check(op);
   if(!active.current)return;
   check(op);if(!safeRestoreRef.current()){setMsg(tr('พบข้อมูลใหม่บน Drive กรุณากลับหน้าแฟ้มโครงการแล้วกดซิงค์อีกครั้ง','New cloud data found. Return to the project list and sync again.'));return;}
   // Only the local replacement transaction needs to block edits. Uploads and remote checks remain non-modal.
   flushSync(()=>setApplyingRestore(true));
   try{
    check(op);if(!safeRestoreRef.current())throw Error(tr('กรุณากลับหน้าแฟ้มโครงการก่อนโหลดข้อมูล','Return to the project list before restoring.'));
    await restoreSyncRecords(data.records,records,JSON.stringify({id:remote.id,hash:remoteHash}));
    if(active.current){onRestored();await finish(data.records,tr('โหลดข้อมูลสำเร็จ '+remoteProjects.length+' แฟ้มโครงการ','Downloaded '+remoteProjects.length+' projects successfully'));}
   }finally{if(active.current)setApplyingRestore(false);}
  }
 }
 async function toggleAuto(){
  if(!link||busy)return;
  const next=!auto;
  try{
   workspaceStorage.setItem(AUTO,next?'1':'0');
   if(!await flushWorkspace())throw Error('Local settings save failed');
   autoHold.current=false;setAuto(next);
   setMsg(next?tr('เปิดซิงค์อัตโนมัติแล้ว เมื่อบันทึกงานและเปิดเว็บอยู่','Auto sync enabled while the app is open.'):tr('ปิดซิงค์อัตโนมัติแล้ว ยังบันทึกลงเครื่องตามปกติ','Auto sync disabled. Local saving continues.'));
  }catch(e){setMsg(String(e));}
 }
 useEffect(()=>{
  if(!auto||!link||paused||visible)return;
  let disposed=false;let timer:number|undefined;
  const run=()=>{
   if(disposed||autoHold.current||operation.current||document.visibilityState!=='visible'||!navigator.onLine)return;
   const access=validToken(userId);
   if(!access){setMsg(tr('ซิงค์อัตโนมัติรอยืนยัน Google — เปิดหน้าซิงค์แล้วกดปุ่มสีเขียว','Auto sync needs Google authorization. Open sync and press the green button.'));return;}
   const op=new AbortController();operation.current=op;setBusy(true);setAutoRunning(true);setCancelling(false);
   void sync(false,access,op,true).catch(e=>handleError(e,op)).finally(()=>end(op));
  };
  const schedule=()=>{if(timer!==undefined)window.clearTimeout(timer);timer=window.setTimeout(run,12000);};
  const focus=()=>{if(document.visibilityState==='visible')schedule();};
  window.addEventListener('tis-workspace-sync-change',schedule);
  window.addEventListener('online',schedule);
  document.addEventListener('visibilitychange',focus);
  const poll=window.setInterval(run,45000);
  schedule();
  return()=>{disposed=true;if(timer!==undefined)window.clearTimeout(timer);window.clearInterval(poll);window.removeEventListener('tis-workspace-sync-change',schedule);window.removeEventListener('online',schedule);document.removeEventListener('visibilitychange',focus);};
 },[auto,link?.id,paused,visible,userId,lang]);
 const switchControl=<button type="button" role="switch" aria-checked={auto} disabled={!link||busy} onClick={()=>void toggleAuto()} className="flex items-center gap-2 text-sm font-semibold disabled:opacity-50"><span className={'inline-flex w-11 h-6 rounded-full p-0.5 transition-colors '+(auto?'bg-emerald-600 justify-end':'bg-slate-400 justify-start')}><span className="w-5 h-5 bg-white rounded-full shadow"/></span>{tr('ซิงค์อัตโนมัติ','Auto sync')} · {auto?tr('เปิด','On'):tr('ปิด','Off')}</button>;
 const match=msg.match(/(\d+)\s*\/\s*(\d+)\s*$/);
 const progress=match&&Number(match[2])>0?{done:Math.min(Number(match[1]),Number(match[2])),total:Number(match[2])}:null;
 if(!visible)return <>{(busy||auto||msg)&&<div className="bg-slate-50 border-b border-slate-200 px-4 py-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
  <span className="font-semibold text-emerald-800 flex items-center gap-2">{busy&&<span aria-hidden="true" className="w-3.5 h-3.5 rounded-full border-2 border-current border-r-transparent animate-spin"/>}{busy?(cancelling?tr('กำลังยกเลิก Google Drive…','Cancelling Google Drive…'):autoRunning?tr('กำลังซิงค์อัตโนมัติ…','Auto syncing…'):tr('Google Drive กำลังทำงาน…','Google Drive working…')):auto?tr('ซิงค์อัตโนมัติ: เปิด','Auto sync: On'):tr('Google Drive','Google Drive')}</span>
  <span role="status" aria-live="polite" className="flex-1 min-w-[140px] text-slate-600 break-words">{msg||(busy?tr('กำลังดำเนินการ…','Working…'):tr('รอตรวจสอบข้อมูล','Waiting to check workspace'))}</span>
  {busy&&progress&&<progress aria-label={tr('ความคืบหน้าการส่งไฟล์','File export progress')} value={progress.done} max={progress.total} className="w-24 sm:w-36 h-2 accent-emerald-600"/>}
  {busy&&<button type="button" disabled={cancelling||applyingRestore} onClick={cancel} className="rounded-md border border-red-400 px-2 py-1 text-red-700 font-semibold disabled:opacity-50">{tr('ยกเลิก','Cancel')}</button>}
  <button type="button" onClick={onOpen} className="rounded-md border border-blue-300 px-2 py-1 text-blue-800 font-semibold">{tr('ดูรายละเอียด','View details')}</button>
 </div>}
 {applyingRestore&&<div role="status" aria-live="polite" className="fixed inset-0 z-[9999] bg-slate-900/60 flex items-center justify-center p-4"><div className="rounded-xl bg-white text-slate-900 p-5 font-semibold">{tr('กำลังบันทึกข้อมูลที่รับจาก Drive ลงเครื่อง กรุณารอให้เสร็จก่อนแก้ไขแฟ้ม','Applying restored Drive data. Editing will resume when complete.')}</div></div>}
 </>;
 return <div className="fixed inset-0 z-[80] bg-slate-900/60 flex items-center justify-center p-4"><section role="dialog" aria-modal="true" className="bg-white rounded-2xl p-5 max-w-lg w-full max-h-[90vh] overflow-auto space-y-4">
 <div className="flex justify-between items-center"><h2 className="font-bold text-slate-900">Google Drive Sync · {tr('ทดลอง','Beta')}</h2><button type="button" disabled={applyingRestore} onClick={onClose} className="border border-slate-300 rounded px-3 py-1 text-slate-800 font-semibold disabled:opacity-50">{busy?tr('ซ่อนหน้าต่าง','Minimize'):tr('ปิด','Close')}</button></div>
 <p className="text-sm text-slate-600">{tr('ซิงค์งานระหว่างอุปกรณ์ หรือเลือกส่งสำเนาไฟล์ไป My Drive แยกกัน ไม่ส่งรหัสผ่านหรือ Gemini API Key','Sync between devices or export visible copies to My Drive separately. Passwords and Gemini API keys are excluded.')}</p>
 {link&&<div className="rounded-lg bg-emerald-50 p-3 text-sm break-all"><strong>{tr('จดจำบัญชี Google แล้ว','Google account remembered')}</strong><div>{link.email}</div>{link.lastSync&&<div className="text-xs mt-1">{tr('ซิงค์ล่าสุด: ','Last sync: ')}{new Date(link.lastSync).toLocaleString(lang==='th'?'th-TH':'en-GB')}</div>}</div>}
 {!link&&<button disabled={!ready||busy} onClick={()=>connect('connect',true)} className="w-full rounded bg-blue-800 text-white p-3 disabled:opacity-50">{tr('เชื่อม Google Drive','Connect Google Drive')}</button>}
 <h3 className="font-semibold text-sm border-t pt-3">{tr('1. ซิงค์ข้อมูลระหว่างอุปกรณ์','1. Sync between devices')}</h3>
 <div className="rounded-lg border border-slate-200 p-3 space-y-1">{switchControl}<p className="text-xs text-slate-500">{tr('เปิดเพื่อซิงค์หลังบันทึกและตรวจข้อมูลใหม่ขณะเปิดเว็บ รับข้อมูลเมื่ออยู่หน้าแฟ้มโครงการ ไม่ส่งสำเนารูปแยก และไม่ขอสิทธิ์ Google เองเมื่อหมดอายุ','Sync saved changes and check updates while the app is open. Receive on the idle project list. No visible file export or automatic Google authorization.')}</p></div>
 <button disabled={!ready||busy||!link} onClick={()=>connect('sync')} className="w-full rounded bg-emerald-700 text-white p-3 disabled:opacity-50">{busy?tr('กำลังดำเนินการ…','Working…'):tr('ซิงค์ข้อมูลล่าสุด','Sync latest workspace')}</button>
 <button disabled={!ready||busy||!link} onClick={()=>connect('download')} className="w-full rounded border border-blue-700 text-blue-800 p-3 font-semibold disabled:opacity-50">{tr('โหลดข้อมูลจาก Google Drive ลงเครื่อง','Download workspace from Google Drive')}</button>
 <h3 className="font-semibold text-sm border-t pt-3">{tr('2. ส่งไฟล์ไปยัง Google Drive','2. Export files to Google Drive')}</h3>
 <button disabled={!ready||busy||!link} onClick={()=>connect('export')} className="w-full rounded bg-blue-800 text-white p-3 disabled:opacity-50">{tr('ส่งไฟล์ไปยัง Google Drive','Export files to Google Drive')}</button>
 {link?.lastExport&&<p className="text-xs text-slate-500">{tr('ส่งไฟล์ล่าสุด: ','Last export: ')}{new Date(link.lastExport).toLocaleString(lang==='th'?'th-TH':'en-GB')}</p>}
 {busy&&<button type="button" disabled={cancelling} onClick={cancel} className="w-full rounded border border-red-600 text-red-700 p-3 font-bold disabled:opacity-50">{cancelling?tr('กำลังยกเลิก…','Cancelling…'):tr('ยกเลิกการดำเนินการ','Cancel operation')}</button>}
 {link?.folder&&/^[A-Za-z0-9_-]+$/.test(link.folder)&&<a className="block text-center rounded border border-slate-300 p-3 font-semibold text-blue-800" href={'https://drive.google.com/drive/folders/'+link.folder} target="_blank" rel="noopener noreferrer">{tr('เปิดโฟลเดอร์ Google Drive','Open Google Drive folder')}</a>}
 {link&&<div className="flex justify-between gap-2"><button disabled={!ready||busy} onClick={()=>connect('connect',true)} className="text-xs underline">{tr('ยืนยันบัญชี Google ใหม่','Reconnect Google account')}</button><button disabled={busy} onClick={async()=>{if(!window.confirm(tr('ยกเลิกการจดจำบัญชีบนเครื่องนี้? ไฟล์ Drive และแฟ้มงานจะไม่ถูกลบ','Forget this Google account on this device? No Drive or local files will be deleted.')))return;clearDriveSession();setToken('');try{workspaceStorage.removeItem(LINK);workspaceStorage.setItem(AUTO,'0');if(!await flushWorkspace())throw Error('Local save failed');setLink(null);setAuto(false);setMsg(tr('ยกเลิกการจดจำบัญชีแล้ว','Account link forgotten'));}catch(e){setMsg(String(e));}}} className="text-xs text-red-700 underline">{tr('ยกเลิกการเชื่อมต่อ','Disconnect')}</button></div>}
 {msg&&<div role="status" className="text-sm bg-slate-100 rounded p-3 break-words"><p>{msg}</p>{busy&&progress&&<progress aria-label={tr('ความคืบหน้าการส่งไฟล์','File export progress')} value={progress.done} max={progress.total} className="mt-2 w-full h-2 accent-emerald-600"/>}</div>}
 {busy&&!applyingRestore&&<p className="text-xs text-slate-600">{tr('กดซ่อนหน้าต่างเพื่อทำงานอื่นต่อได้ โดยงานจะทำต่อขณะเปิดเว็บนี้ไว้','Minimize to continue other work. Keep this app open until the operation finishes.')}</p>
 <p className="text-xs text-slate-500">{tr('กดซิงค์หลังบันทึกงาน ใช้บัญชีเดิมทั้งสองเครื่อง หาก Google หมดอายุสิทธิ์อาจเปิดหน้าขออนุญาตอีกครั้ง สำเนาใน My Drive เป็นไฟล์สำหรับเปิดดู ไม่ใช่ต้นทางซิงค์ และเก็บรุ่นเก่าไว้','Sync after saving. Use the same accounts on both devices. Google may request authorization again when access expires. Visible copies are for viewing, not the sync source, and older copies are retained.')}</p>
 </section></div>;
}
