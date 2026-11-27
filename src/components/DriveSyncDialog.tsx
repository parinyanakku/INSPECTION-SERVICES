import React,{useEffect,useRef,useState} from 'react';
import {flushSync} from 'react-dom';
import type {AppLanguage} from '../types/inspection';
import {hashWorkspaceRecords} from '../utils/driveRecordHash';
import {mirrorWorkspace} from '../utils/driveVisibleBackup';
import {mergeDriveRecords,readVisibleWorkspace,recoverVisibleRecords,validateDriveRecords,listRecoverySources,readRecoverySource,recoveryPreview,restoreSelectedProject,type DriveRecoverySource} from '../utils/driveRecovery';
import {readSyncRecords,restoreSyncRecords,workspaceStorage,flushWorkspace} from '../utils/workspaceStorage';

const SCOPE='https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/drive.file';
const ROOT='https://www.googleapis.com/drive/v3/files';
const MARK='tis_drive_sync_marker_v1';
// Public OAuth client identifier; never include a client secret in this web app.
const CLIENT_ID='386487455938-nda2mj55c5f3cdr8pvqmq4pu4o775fv2.apps.googleusercontent.com';
type Records=Record<string,string>;
type FileMeta={id:string;appProperties?:Record<string,string>;createdTime?:string;name?:string;size?:string};
type CloudSummary={id:string;date:string;projects:number;defects:number;legacy?:boolean};
type Snapshot={format:'TIS_DRIVE_V1';userId:string;records:Records};
type Marker={id:string;hash:string};
type Identity={id:string;email:string;folder?:string;lastSync?:string;lastExport?:string;lastCloud?:CloudSummary};
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
const digestCache=new WeakMap<Records,Promise<string>>();
function hash(records:Records){
 let result=digestCache.get(records);if(!result){result=hashWorkspaceRecords(records);digestCache.set(records,result);}
 return result;
}
function equalRecords(a:Records,b:Records){const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(k=>a[k]===b[k]);}
async function api(token:string,url:string,init:RequestInit={}){
 const result=await fetch(url,{...init,headers:{...init.headers,Authorization:'Bearer '+token},cache:'no-store'});
 if(!result.ok){let reason='';try{const detail=await result.json();reason=detail.error?.errors?.[0]?.reason||detail.error?.message||'';}catch{}throw Error('Google Drive HTTP '+result.status+(reason?' · '+reason.slice(0,180):''));}
 return result;
}
const PROJECTS='tis_wl_projects_v10',BRAND='tis_wl_brand_v10',REPORT='tis_report_book_v1_';
const countCache=new WeakMap<Records,{projects:number;defects:number}>();
function counts(records:Records){
 const known=countCache.get(records);if(known)return known;
 const p=JSON.parse(records[PROJECTS]||'[]') as {defects:unknown[]}[];
 const c={projects:p.length,defects:p.reduce((n,x)=>n+x.defects.length,0)};countCache.set(records,c);return c;
}
function cloudInfo(file:FileMeta,records?:Records):CloudSummary|null{
 const p=file.appProperties||{};
 const c=records?counts(records):{projects:Number(p.projects),defects:Number(p.defects)};
 if(!file.createdTime||!Number.isFinite(Date.parse(file.createdTime))||!Number.isSafeInteger(c.projects)||!Number.isSafeInteger(c.defects)||c.projects<0||c.defects<0)return null;
 return {id:file.id,date:file.createdTime,...c,legacy:p.tisJson!=='1'};
}
async function files(token:string,userId:string,signal?:AbortSignal,explicitChoice=false){
 // New visible JSON revisions are authoritative after migration. Legacy appData remains readable.
 for(const space of ['drive','appDataFolder']){
  const all:FileMeta[]=[];let next='';
  do{
   const q=new URLSearchParams({spaces:space,q:"trashed = false and appProperties has { key='tisUser' and value='"+userId+"' }"+(space==='drive'?" and appProperties has { key='tisJson' and value='1' }":''),fields:'nextPageToken,files(id,name,createdTime,appProperties)',pageSize:'100',orderBy:'createdTime desc'});
   if(next)q.set('pageToken',next);
   const json=await (await api(token,ROOT+'?'+q,{signal})).json();
   all.push(...(json.files||[]));next=json.nextPageToken||'';
   if(space==='drive'&&all.length)break;
  }while(next);
  if(!all.length)continue;
  if(space==='drive'){
   // Immutable revisions are retained; Drive's server timestamp determines latest.
   return all.sort((a,b)=>Date.parse(b.createdTime||'')-Date.parse(a.createdTime||'')||b.id.localeCompare(a.id))[0];
  }
  const parents=new Set(all.map(f=>f.appProperties?.parent).filter(Boolean));
  const heads=all.filter(f=>!parents.has(f.id));
  if(heads.length!==1){if(explicitChoice&&heads.length)return heads.sort((a,b)=>Date.parse(b.createdTime||'')-Date.parse(a.createdTime||'')||b.id.localeCompare(a.id))[0];throw Error('CONFLICT');}
  return heads[0];
 }
 return undefined;
}
async function readSnapshot(token:string,userId:string,id:string,signal?:AbortSignal,progress?:(received:number,total:number)=>void):Promise<Snapshot>{
 const response=await api(token,ROOT+'/'+encodeURIComponent(id)+'?alt=media',{signal});
 const total=Number(response.headers.get('Content-Length'))||0;
 let data;
 if(progress&&response.body){
  const reader=response.body.getReader();let parts:Uint8Array<ArrayBuffer>[]=[];let received=0;
  try{for(;;){const chunk=await reader.read();if(chunk.done)break;parts.push(new Uint8Array(chunk.value));received+=chunk.value.byteLength;progress(received,total);}}finally{reader.releaseLock();}
  const blob=new Blob(parts,{type:'application/json'});parts=[];
  progress(received,received);data=JSON.parse(await blob.text());
 }else data=await response.json();
 if(data.userId!==userId)throw Error('Backup account mismatch');
 if(data.format==='TIS_DRIVE_V1')return {...data,records:validateDriveRecords(data.records)};
 if(data.format!=='TIS_HOME_INSPECTION_BACKUP_V10'||!Array.isArray(data.projects)||!data.reportBooks||typeof data.reportBooks!=='object')throw Error('Invalid JSON backup');
 const expectedHash=data.contentHash;
 const records:Records={[PROJECTS]:JSON.stringify(data.projects)};
 if(data.brand&&typeof data.brand==='object')records[BRAND]=JSON.stringify(data.brand);
 for(const [id,report] of Object.entries(data.reportBooks))records[REPORT+id]=JSON.stringify(report);
 if(data.projects.some((p:{id?:unknown;floors?:unknown;defects?:unknown})=>!p||typeof p.id!=='string'||!Array.isArray(p.floors)||!Array.isArray(p.defects))||new Set(data.projects.map((p:{id:string})=>p.id)).size!==data.projects.length)throw Error('Invalid cloud projects');
 for(const report of Object.values(data.reportBooks))if(!report||typeof report!=='object'||Array.isArray(report))throw Error('Invalid report data');
 countCache.set(records,{projects:data.projects.length,defects:data.projects.reduce((n:number,p:{defects:unknown[]})=>n+p.defects.length,0)});
 data=null;
 if(expectedHash!==await hash(records))throw Error('JSON backup integrity check failed');
 return {format:'TIS_DRIVE_V1',userId,records};
}
async function jsonFolder(token:string,userId:string,signal?:AbortSignal){
 const q=new URLSearchParams({spaces:'drive',q:"trashed = false and mimeType = 'application/vnd.google-apps.folder' and appProperties has { key='tisOwner' and value='"+userId+"' } and appProperties has { key='tisFolder' and value='latest-json' }",fields:'files(id)',pageSize:'100'});
 const matches=await (await api(token,ROOT+'?'+q,{signal})).json();
 if(matches.files?.[0]?.id)return matches.files[0].id as string;
 const folder=await (await api(token,ROOT+'?fields=id',{method:'POST',signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'TIS - Latest JSON backups',mimeType:'application/vnd.google-apps.folder',appProperties:{tisOwner:userId,tisFolder:'latest-json'}})})).json();
 if(!folder.id)throw Error('Drive folder not confirmed');return folder.id as string;
}
async function upload(token:string,userId:string,records:Records,parent:string,signal?:AbortSignal,progress?:(sent:number,total:number)=>void){
 validateDriveRecords(records);
 const folder=await jsonFolder(token,userId,signal);
 const projects=JSON.parse(records[PROJECTS]),reportBooks:Record<string,unknown>={};
 for(const [key,value] of Object.entries(records))if(key.startsWith(REPORT))Object.defineProperty(reportBooks,key.slice(REPORT.length),{value:JSON.parse(value),enumerable:true});
 const exportedAt=new Date().toISOString(),contentHash=await hash(records),c=counts(records);
 const snapshot={format:'TIS_HOME_INSPECTION_BACKUP_V10',exportedAt,userId,contentHash,brand:records[BRAND]?JSON.parse(records[BRAND]):undefined,projects,reportBooks};
 const metadata={name:'TIS_FullBackup_'+exportedAt.replace(/[:.]/g,'-')+'.json',parents:[folder],mimeType:'application/json',appProperties:{tisUser:userId,tisJson:'1',parent:parent||'root',projects:String(c.projects),defects:String(c.defects),hash:contentHash}};
 const payload=new Blob([JSON.stringify(snapshot)],{type:'application/json'});
 const fields='id,createdTime,appProperties,size';
 const start=await api(token,'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields='+fields,{method:'POST',signal,headers:{'Content-Type':'application/json; charset=UTF-8','X-Upload-Content-Type':'application/json','X-Upload-Content-Length':String(payload.size)},body:JSON.stringify(metadata)});
 const location=start.headers.get('Location');
 if(!location)throw Error('Drive did not return an upload session');
 const session=new URL(location);
 if(session.protocol!=='https:'||!['www.googleapis.com','content.googleapis.com'].includes(session.hostname)||session.username||session.password)throw Error('Invalid Drive upload session');
 const chunk=4*1024*1024;let offset=0,attempts=0;let data:FileMeta|undefined;
 async function put(range:string,body?:Blob){
  return fetch(session.href,{method:'PUT',signal,headers:{Authorization:'Bearer '+token,'Content-Range':range,'Content-Type':'application/json'},body,cache:'no-store'});
 }
 function acknowledged(res:Response){
  const range=res.headers.get('Range');if(!range)return 0;
  const m=/^bytes=0-(\d+)$/.exec(range);if(!m)throw Error('Invalid Drive upload range');
  const n=Number(m[1])+1;if(!Number.isSafeInteger(n)||n>payload.size)throw Error('Invalid Drive upload offset');return n;
 }
 progress?.(0,payload.size);
 while(!data){
  if(signal?.aborted)throw Error('CANCELLED');
  const end=Math.min(payload.size,offset+chunk);
  let res:Response|undefined;
  try{res=await put('bytes '+offset+'-'+(end-1)+'/'+payload.size,payload.slice(offset,end));}catch(e){if(signal?.aborted)throw e;}
  if(!res||res.status===429||res.status>=500){
   if(++attempts>4)throw Error('Drive upload interrupted; retry from the computer with the latest work');
   await new Promise<void>(resolve=>setTimeout(resolve,Math.min(4000,500*2**attempts)));
   if(signal?.aborted)throw Error('CANCELLED');
   try{res=await put('bytes */'+payload.size);}catch(e){if(signal?.aborted)throw e;continue;}
   if(res.status===429||res.status>=500)continue;
  }
  if(res.status===308){
   const next=acknowledged(res);
   if(next<=offset){if(++attempts>4)throw Error('Drive upload made no progress');}else attempts=0;
   offset=next;progress?.(offset,payload.size);
   if(offset===payload.size){
    const status=await put('bytes */'+payload.size);if(!status.ok)throw Error('Drive upload completion not confirmed');data=await status.json() as FileMeta;
   }
   continue;
  }
  if(!res.ok){let reason='';try{const detail=await res.json();reason=detail.error?.errors?.[0]?.reason||detail.error?.message||'';}catch{}throw Error('Google Drive HTTP '+res.status+(reason?' · '+reason.slice(0,180):''));}
  data=await res.json() as FileMeta;
 }
 if(typeof data.id!=='string')throw Error('Upload not confirmed');
 // Confirm actual stored file metadata, not just the upload request.
 const saved=await (await api(token,ROOT+'/'+encodeURIComponent(data.id)+'?fields='+fields,{signal})).json() as FileMeta;
 if(saved.id!==data.id||saved.appProperties?.tisUser!==userId||saved.appProperties?.hash!==contentHash||Number(saved.size)!==payload.size||!cloudInfo(saved,records))throw Error('Drive file size or hash metadata not confirmed');
 progress?.(payload.size,payload.size);data=saved;
 return data;
}
export function DriveSyncDialog({userId,lang,visible,paused,canAutoRestore,onClose,onRestored,onOpen,onBusyChange}:{userId:string;lang:AppLanguage;visible:boolean;paused:boolean;canAutoRestore:()=>boolean;onClose:()=>void;onRestored:()=>void;onOpen:()=>void;onBusyChange:(busy:boolean)=>void}){
 const tr=(th:string,en:string)=>lang==='en'?en:th;
 const [ready,setReady]=useState(!!gis()),[,setToken]=useState(()=>validToken(userId)),[busy,setBusy]=useState(false),[msg,setMsg]=useState('');
 const [link,setLink]=useState<Identity|null>(readLink);
 const [cloud,setCloud]=useState<CloudSummary|null>(()=>readLink()?.lastCloud||null);
 const [checkedAt,setCheckedAt]=useState('');
 const [localSummary,setLocalSummary]=useState<{projects:number;defects:number}|null>(null);
 const [advanced,setAdvanced]=useState(false);
 useEffect(()=>{if(!visible)return;let done=false;const refresh=()=>{void readSyncRecords().then(records=>{if(!done)setLocalSummary(counts(records));}).catch(()=>{if(!done)setLocalSummary(null);});};refresh();window.addEventListener('tis-workspace-sync-change',refresh);return()=>{done=true;window.removeEventListener('tis-workspace-sync-change',refresh);};},[visible]);
 const active=useRef(true);
 const [auto,setAuto]=useState(readAuto);
 const autoHold=useRef(false);
 const safeRestoreRef=useRef(canAutoRestore);safeRestoreRef.current=canAutoRestore;
 const [autoRunning,setAutoRunning]=useState(false);
 const operation=useRef<AbortController|null>(null);
 const [cancelling,setCancelling]=useState(false);
 const [applyingRestore,setApplyingRestore]=useState(false);
 const [sources,setSources]=useState<DriveRecoverySource[]>([]);
 const [selectedSource,setSelectedSource]=useState<DriveRecoverySource|null>(null);
 const [recoveryData,setRecoveryData]=useState<Records|null>(null);
 const [preview,setPreview]=useState<ReturnType<typeof recoveryPreview>>([]);
 const [recoveryOpen,setRecoveryOpen]=useState(false);
 const [restoreMode,setRestoreMode]=useState<'copy'|'replace'>('copy');
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
 function connect(action:'connect'|'sync'|'download'|'export'|'recover'|'browse'|'publish'='connect',choose=false){
  if(operation.current){setMsg(tr('กำลังทำงานอยู่ กรุณารอหรือกดยกเลิก','An operation is already running. Wait or cancel it.'));return;}
  if(paused){setMsg(tr('ปิดหน้าต่างจัดการบัญชีก่อนซิงค์','Close account management before syncing.'));return;}
  if(!gis()){setMsg(tr('Google ยังโหลดไม่สำเร็จ กรุณาเปิดหน้าซิงค์ใหม่','Google sign-in is not ready. Reopen sync settings.'));return;}
  autoHold.current=false;
  const op=new AbortController();operation.current=op;setBusy(true);setCancelling(false);setMsg(tr('กำลังตรวจสิทธิ์ Google Drive…','Checking Google Drive authorization…'));
  const run=async(access:string)=>{
   try{check(op);if(action==='export')await exportFiles(access,op);else if(action==='recover')await recoverBackup(access,op);else if(action==='browse')await browseBackups(access,op);else if(action==='publish')await publishLatest(access,op);else if(action!=='connect')await sync(action==='download',access,op);}
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
      if(action==='connect')setMsg(tr('ยืนยัน Google สำเร็จ เลือกส่งหรือโหลด JSON ได้เลย','Google authorized. Choose send or load JSON.'));
      else if(action==='export')await exportFiles(access,op);
      else if(action==='recover')await recoverBackup(access,op);
      else if(action==='browse')await browseBackups(access,op);
      else if(action==='publish')await publishLatest(access,op);
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
 async function browseBackups(token:string,op:AbortController,autoPreview=false){
  autoHold.current=true;setAdvanced(true);setRecoveryOpen(true);setSources([]);setSelectedSource(null);setRecoveryData(null);setPreview([]);
  setMsg(tr('กำลังค้นหาสำรอง Workspace และข้อมูลโครงการใน Drive…','Finding workspace and project backups…'));
  const result=await listRecoverySources(token,userId,op.signal);check(op);setSources(result);
  setMsg(result.length?tr('พบไฟล์สำรอง '+result.length+' ไฟล์ เลือกฉบับเพื่อตรวจจำนวน Defect','Found '+result.length+' backups. Select a version to compare defect counts.'):tr('ไม่พบไฟล์สำรอง JSON ของบัญชีนี้ ตรวจบัญชีโปรแกรมและบัญชี Google ทั้งสองเครื่อง','No JSON backups for this account. Check both app and Google accounts on both devices.'));
  if(autoPreview&&result.length){const source=result.find(x=>x.kind==='json'||x.kind==='workspace')||result[0];setSelectedSource(source);const data=await readRecoverySource(token,userId,source,op.signal);check(op);const local=await readSyncRecords();check(op);setRecoveryData(data);setPreview(recoveryPreview(local,data));setRestoreMode('copy');setMsg(tr('พบข้อมูลสำรอง ตรวจจำนวน Defect ด้านล่างแล้วเลือกกู้คืนแฟ้มที่ต้องการ','Backup found. Compare defect counts below and select a project to restore.'));}
 }
 async function inspectBackup(source:DriveRecoverySource){
  if(operation.current)return;
  const token=validToken(userId);if(!token){setMsg(tr('สิทธิ์ Google หมดอายุ กรุณากดค้นหาไฟล์สำรองใหม่','Google authorization expired. Search backups again.'));return;}
  const op=new AbortController();operation.current=op;setBusy(true);setCancelling(false);setSelectedSource(source);setRecoveryData(null);setPreview([]);setRestoreMode('copy');
  try{setMsg(tr('กำลังอ่านข้อมูลสำรอง…','Reading backup…'));const data=await readRecoverySource(token,userId,source,op.signal);check(op);
   const local=await readSyncRecords();check(op);setPreview(recoveryPreview(local,data));setRecoveryData(data);setMsg(tr('อ่านข้อมูลสำรองแล้ว เลือกแฟ้มที่ต้องการกู้คืน','Backup read. Select a project to restore.'));
  }catch(e){handleError(e,op);}finally{end(op);}
 }
 async function restoreProject(id:string){
  if(operation.current||!recoveryData||!selectedSource)return;
  const op=new AbortController();operation.current=op;setBusy(true);setCancelling(false);autoHold.current=true;
  try{
   if(!safeRestoreRef.current())throw Error(tr('กลับหน้าแฟ้มโครงการก่อนกู้คืน','Return to the project list before recovery.'));
   const current=await readSyncRecords();check(op);
   const item=recoveryPreview(current,recoveryData).find(x=>x.id===id);if(!item)throw Error('Project not found');
   if(item.identical){setMsg(tr('ข้อมูลฉบับนี้มีอยู่ในเครื่องแล้ว','This version already exists locally.'));return;}
   const mode=selectedSource.kind==='project'?'copy':restoreMode;
   if(!window.confirm(tr('กู้คืน '+item.name+' จาก Drive '+item.cloudCount+' ข้อ'+(item.localCount===null?'':mode==='replace'?' แทนที่ฉบับในเครื่อง '+item.localCount+' ข้อ โดยเก็บข้อมูลก่อนกู้คืนไว้':' เป็นแฟ้มแยก โดยคงฉบับเดิม '+item.localCount+' ข้อ')+' หรือไม่?','Restore '+item.name+' ('+item.cloudCount+' defects)'+(item.localCount===null?'':mode==='replace'?' replacing the local '+item.localCount+' defects; previous data is retained':' as a separate copy')+'?')))return;
   check(op);if(!safeRestoreRef.current())throw Error('Workspace is not idle');
   const result=restoreSelectedProject(current,recoveryData,id,mode);
   flushSync(()=>setApplyingRestore(true));
   try{
    check(op);if(!safeRestoreRef.current())throw Error('Workspace is not idle');
    await restoreSyncRecords(result.records,current,workspaceStorage.getItem(MARK)||'null');
    if(active.current){onRestored();setPreview(recoveryPreview(result.records,recoveryData));setMsg(tr('กู้คืน '+result.name+' สำเร็จ · '+result.count+' Defect — ตรวจสอบแฟ้มก่อนกดซิงค์อีกครั้ง','Restored '+result.name+' · '+result.count+' defects. Verify before syncing again.'));}
   }finally{if(active.current)setApplyingRestore(false);}
  }catch(e){handleError(e,op);}finally{end(op);}
 }
 async function recoverBackup(token:string,op:AbortController,automatic=false){
  setMsg(tr('กำลังค้นหาไฟล์ข้อมูลสำรองบน Google Drive…','Looking for a Drive workspace backup…'));
  const current=await readSyncRecords();check(op);
  const backup=await readVisibleWorkspace(token,userId,op.signal);check(op);
  if(!backup){setMsg(tr('ไม่พบไฟล์ Workspace JSON ที่โปรแกรมเคยสำรองไว้ รูปภาพอย่างเดียวไม่สามารถกู้คืนหมุดและรายละเอียดทั้งหมดได้','No app-created Workspace JSON backup found. Photos alone cannot restore all pins and details.'));return false;}
  if(!safeRestoreRef.current()){setMsg(tr('พบไฟล์สำรอง กรุณากลับหน้าแฟ้มโครงการเพื่อรับข้อมูล','Backup found. Return to the project list to recover it.'));return false;}
  const result=recoverVisibleRecords(current,backup.records,false);
  if(!result.recovered.length){setMsg(result.conflicts.length?tr('พบแฟ้มชื่อเดียวกันแต่ข้อมูลต่างกัน ระบบไม่เขียนทับ กรุณาสำรอง JSON ทั้งสองเครื่อง','Conflicting project versions found; no overwrite. Back up both devices.'):tr('มีแฟ้มจากสำรองชุดล่าสุดครบแล้ว','All projects in the latest backup are present.'));return false;}
  if(!automatic&&!window.confirm(tr('พบ '+result.recovered.length+' แฟ้มที่ยังไม่มีในเครื่อง เพิ่มจากไฟล์สำรองวันที่ '+backup.date.slice(0,10)+' โดยไม่ทับแฟ้มเดิมหรือไม่?','Recover '+result.recovered.length+' missing projects from '+backup.date.slice(0,10)+' without overwriting existing projects?')))return false;
  check(op);if(!safeRestoreRef.current())return false;
  flushSync(()=>setApplyingRestore(true));
  try{
   check(op);if(!safeRestoreRef.current())return false;
   const existingMarker=workspaceStorage.getItem(MARK)||'null';
   await restoreSyncRecords(result.records,current,existingMarker);
   if(active.current){onRestored();setMsg(tr('กู้คืน '+result.recovered.length+' แฟ้มจากสำรองแล้ว ไม่ทับแฟ้มเดิม','Recovered '+result.recovered.length+' missing projects without overwrite.')+(result.conflicts.length?' · '+tr('พบข้อมูลต่างกัน '+result.conflicts.length+' แฟ้ม','Conflicts: '+result.conflicts.length):''));}
   if(result.conflicts.length)autoHold.current=true;
   return true;
  }finally{if(active.current)setApplyingRestore(false);}
 }
 function describe(c:{projects:number;defects:number}){return tr(c.projects+' แฟ้ม · '+c.defects+' Defect',c.projects+' projects · '+c.defects+' defects');}
 function showTime(value:string){return new Date(value).toLocaleString(lang==='th'?'th-TH':'en-GB');}
 async function rememberCloud(file:FileMeta,records?:Records){
  const summary=cloudInfo(file,records);if(!summary)return;
  setCloud(summary);const identity=readLink();if(identity)await saveLink({...identity,lastCloud:summary});
 }
 function uploadProgress(sent:number,total:number){const mb=(n:number)=>(n/1048576).toFixed(1);setMsg(tr('ส่ง JSON ','Uploading JSON ')+mb(sent)+' / '+mb(total)+' MB · '+Math.floor(sent/total*100)+'%');}
 async function publishLatest(token:string,op:AbortController){
  const records=await readSyncRecords();check(op);const c=counts(records);
  if(!c.projects)throw Error(tr('ไม่ส่งข้อมูลว่างขึ้น Drive','Cannot publish an empty workspace'));
  const remote=await files(token,userId,op.signal,true);check(op);
  const prior=remote?cloudInfo(remote):null;check(op);
  if(!window.confirm(tr('ส่ง JSON จากเครื่องนี้เป็นฉบับล่าสุดบน Drive: ','Publish this device as the latest Drive JSON: ')+describe(c)+(prior?'\nDrive: '+describe(prior)+' · '+showTime(prior.date):'')+'\n'+tr('ฉบับก่อนหน้าจะยังอยู่ใน Drive ไม่ลบไฟล์เดิม ยืนยันเฉพาะเมื่อเครื่องนี้มีงานล่าสุดจริง','Previous versions are retained. Confirm only if this device has the intended latest work.')))return;
  check(op);if((await files(token,userId,op.signal,true))?.id!==remote?.id)throw Error('CONFLICT');
  const current=await readSyncRecords();if(!equalRecords(current,records))throw Error(tr('งานเปลี่ยนระหว่างยืนยัน กรุณากดส่งอีกครั้ง','Work changed during confirmation; publish again.'));
  check(op);setMsg(tr('กำลังส่ง JSON ฉบับล่าสุด…','Uploading latest JSON…'));
  const file=await upload(token,userId,records,remote?.id||'',op.signal,uploadProgress);check(op);
  workspaceStorage.setItem(MARK,JSON.stringify({id:file.id,hash:await hash(records)}));if(!await flushWorkspace())throw Error('Local marker save failed');
  await rememberCloud(file,records);check(op);
  const identity=readLink();if(identity)await saveLink({...identity,lastSync:new Date().toISOString()});
  setCheckedAt(new Date().toISOString());setMsg(tr('ส่ง JSON ล่าสุดสำเร็จ · ','Latest JSON uploaded · ')+describe(c)+' · '+showTime(file.createdTime!));
 }
 async function sync(downloadOnly:boolean,token:string,op:AbortController,automatic=false){
  setMsg(tr('กำลังตรวจสอบข้อมูลซิงค์…','Checking sync data…'));
  {
   const records=await readSyncRecords(),localHash=await hash(records);check(op);
   const localCount=counts(records).projects;
   const empty=localCount===0&&!Object.keys(records).some(k=>k.startsWith('tis_report_book_v1_'));
   let marker:Marker|null=null;try{marker=JSON.parse(workspaceStorage.getItem(MARK)||'null');}catch{}
   const remote=await files(token,userId,op.signal,downloadOnly);check(op);setCheckedAt(new Date().toISOString());
   if(remote){setCloud(cloudInfo(remote));}else setCloud(null);
   async function finish(confirmed:Records,message:string){
    if(!active.current||operation.current!==op)return;
    const identity=readLink();if(!identity)throw Error('Missing Google account link');
    await saveLink({...identity,lastSync:new Date().toISOString()});
    if(op.signal.aborted){cancelled(op);return;}
    setMsg(message+' · '+describe(counts(confirmed)));
   }
   if(!remote){
    if(downloadOnly){await browseBackups(token,op,true);return;}
    // Recover the latest verified visible backup on an empty device before any initial upload.
    if(empty&&await recoverBackup(token,op,automatic))return;
    if(downloadOnly||empty){setMsg(tr('ไม่พบแฟ้มงานบน Google Drive ของบัญชีนี้ กรุณาตรวจสอบว่าเลือกบัญชี Google และบัญชีโปรแกรมเดียวกับเครื่องที่ส่งข้อมูลแล้ว ระบบไม่ได้ส่งข้อมูลว่างขึ้นไป','No cloud workspace found. Check that both the Google and app accounts match the device that uploaded the work. No empty workspace was uploaded.'));return;}
    if(marker)throw Error('CONFLICT');
    if(automatic){setMsg(tr('ยังไม่ได้ส่งข้อมูลครั้งแรก กรุณากดซิงค์ด้วยตนเองหนึ่งครั้ง','First upload requires one manual sync.'));return;}
    if(!window.confirm(tr('ส่งแฟ้มงาน รูปภาพ แปลน และรายงานของบัญชีนี้ไปยัง Google Drive ที่เพิ่งเลือกหรือไม่?','Send this account’s projects, photos, plans and reports to the selected Google Drive?')))return;
    check(op);const file=await upload(token,userId,records,'',op.signal,uploadProgress),id=file.id;
    if(!active.current)return;
    check(op);workspaceStorage.setItem(MARK,JSON.stringify({id,hash:localHash}));if(!await flushWorkspace())throw Error('Local marker save failed');
    await rememberCloud(file,records);
    await finish(records,tr('ส่งข้อมูลครั้งแรกสำเร็จ','First upload completed'));return;
   }
   if(marker?.id===remote.id&&marker.hash===localHash&&!downloadOnly){await rememberCloud(remote,records);await finish(records,tr('ข้อมูลตรงกันแล้ว','Already synchronized'));return;}
   if(marker?.id===remote.id&&!downloadOnly){
    if(!automatic&&!window.confirm(tr('ส่งงานที่แก้ไขล่าสุดไปยัง Google Drive หรือไม่?','Upload your latest saved changes?')))return;
    if((await files(token,userId,op.signal))?.id!==remote.id)throw Error('CONFLICT');check(op);
    check(op);const file=await upload(token,userId,records,remote.id,op.signal,uploadProgress),id=file.id;
    if(!active.current)return;
    check(op);workspaceStorage.setItem(MARK,JSON.stringify({id,hash:localHash}));if(!await flushWorkspace())throw Error('Local marker save failed');
    await rememberCloud(file,records);
    await finish(records,tr('อัปโหลดข้อมูลล่าสุดแล้ว','Latest saved work uploaded'));return;
   }
   setMsg(tr('กำลังดาวน์โหลด JSON จาก Drive…','Downloading JSON from Drive…'));
   const data=await readSnapshot(token,userId,remote.id,op.signal,(received,total)=>{if(active.current&&!op.signal.aborted)setMsg(tr('ดาวน์โหลด JSON ','Downloading JSON ')+(received/1048576).toFixed(1)+' MB'+(total?' / '+(total/1048576).toFixed(1)+' MB':''));});
   setMsg(tr('กำลังตรวจสอบไฟล์ JSON…','Verifying JSON…'));
   if(data.format!=='TIS_DRIVE_V1'||data.userId!==userId||!data.records||typeof data.records!=='object')throw Error('Invalid snapshot');
   const remoteHash=await hash(data.records);check(op);await rememberCloud(remote,data.records);check(op);
   if(remoteHash===localHash){workspaceStorage.setItem(MARK,JSON.stringify({id:remote.id,hash:localHash}));if(!await flushWorkspace())throw Error('Local marker save failed');await finish(records,tr('ข้อมูลตรงกันแล้ว','Already synchronized'));if(downloadOnly){await browseBackups(token,op,true);}return;}
   const remoteCount=counts(data.records).projects;
   let incoming=data.records;
   if(!downloadOnly&&!empty&&(!marker||marker.hash!==localHash)){
    let base:Records|null=null;
    if(marker?.id&&marker.id!==remote.id){
     try{const ancestor=await readSnapshot(token,userId,marker.id,op.signal); if(ancestor.format==='TIS_DRIVE_V1'&&ancestor.userId===userId&&await hash(ancestor.records)===marker.hash)base=validateDriveRecords(ancestor.records);}catch(e){check(op);}
    }
    const merged=mergeDriveRecords(records,data.records,base);
    if(merged.conflicts.length){autoHold.current=true;setMsg(tr('พบข้อมูลแก้ไขต่างกันในแฟ้ม: ','Conflicting edits in: ')+merged.conflicts.slice(0,5).join(', ')+tr(' — ไม่เขียนทับ กรุณาสำรอง JSON ทั้งสองเครื่อง',' — no overwrite. Back up both devices.'));return;}
    incoming=merged.records;
   }
   if(!remoteCount&&localCount){setMsg(tr('แฟ้มบน Drive ว่าง แต่เครื่องนี้มีงาน ระบบไม่โหลดทับ','Cloud workspace is empty but this device has work. Restore stopped.'));return;}
   if(!safeRestoreRef.current()){setMsg(tr('มีข้อมูลใหม่บน Drive '+remoteCount+' แฟ้ม จะรับเมื่อกลับหน้าแฟ้มโครงการ','New cloud data: '+remoteCount+' projects. Download deferred until the project list is idle.'));return;}
   if(!automatic&&!window.confirm(tr('ข้อมูลในเครื่อง: ','Local: ')+describe(counts(records))+'\nDrive: '+describe(counts(data.records))+' · '+(remote.createdTime?showTime(remote.createdTime):tr('ไม่ทราบเวลาไฟล์','Unknown file time'))+'\n'+tr(downloadOnly?'ใช้ JSON ล่าสุดบน Drive แทนข้อมูลในเครื่องหรือไม่? ระบบเก็บข้อมูลก่อนโหลดไว้ในเครื่อง':'รับและรวมข้อมูลจาก Drive หรือไม่? ระบบเก็บข้อมูลก่อนโหลดไว้ในเครื่อง',downloadOnly?'Replace local data with latest Drive JSON? The previous local snapshot is retained.':'Receive and merge Drive data? The previous local snapshot is retained.')))return;
   if((await files(token,userId,op.signal,downloadOnly))?.id!==remote.id)throw Error('CONFLICT');check(op);
   if(!active.current)return;
   check(op);if(!safeRestoreRef.current()){setMsg(tr('พบข้อมูลใหม่บน Drive กรุณากลับหน้าแฟ้มโครงการแล้วกดซิงค์อีกครั้ง','New cloud data found. Return to the project list and sync again.'));return;}
   // Only the local replacement transaction needs to block edits. Uploads and remote checks remain non-modal.
   flushSync(()=>setApplyingRestore(true));
   try{
    check(op);if(!safeRestoreRef.current())throw Error(tr('กรุณากลับหน้าแฟ้มโครงการก่อนโหลดข้อมูล','Return to the project list before restoring.'));
    setMsg(tr('กำลังบันทึก JSON ลงเครื่อง…','Saving JSON locally…'));
    await restoreSyncRecords(incoming,records,JSON.stringify({id:remote.id,hash:remoteHash}));
    const stored=await readSyncRecords();if(!equalRecords(stored,incoming))throw Error(tr('ตรวจสอบข้อมูลหลังบันทึกไม่ตรงกัน','Local restore verification failed'));
    if(active.current){onRestored();await finish(incoming,tr(downloadOnly?'โหลด JSON ล่าสุดสำเร็จ':'รับและรวมข้อมูลจาก Drive สำเร็จ',downloadOnly?'Latest JSON loaded':'Drive data received and merged'));}
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
  if(!auto||!link||paused||visible||recoveryOpen)return;
  let disposed=false;let timer:number|undefined;
  const run=()=>{
   if(disposed||autoHold.current||operation.current||document.visibilityState!=='visible'||!navigator.onLine)return;
   const access=validToken(userId);
   if(!access){setMsg(tr('สิทธิ์ Google หมดอายุ · เปิด Drive แล้วกดยืนยัน Google หรือส่ง/โหลด JSON','Google authorization expired. Open Drive and authorize or send/load JSON.'));return;}
   const op=new AbortController();operation.current=op;setBusy(true);setAutoRunning(true);setCancelling(false);
   void sync(false,access,op,true).catch(e=>handleError(e,op)).finally(()=>end(op));
  };
  const schedule=()=>{if(timer!==undefined)window.clearTimeout(timer);timer=window.setTimeout(run,4000);};
  const focus=()=>{if(document.visibilityState==='visible')schedule();};
  window.addEventListener('tis-workspace-sync-change',schedule);
  window.addEventListener('online',schedule);
  window.addEventListener('focus',schedule);
  document.addEventListener('visibilitychange',focus);
  const poll=window.setInterval(run,20000);
  schedule();
  return()=>{disposed=true;if(timer!==undefined)window.clearTimeout(timer);window.clearInterval(poll);window.removeEventListener('tis-workspace-sync-change',schedule);window.removeEventListener('online',schedule);window.removeEventListener('focus',schedule);document.removeEventListener('visibilitychange',focus);};
 },[auto,link?.id,paused,visible,userId,lang,recoveryOpen]);
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
 <div className="sticky top-0 z-10 -mx-1 bg-white px-1 pb-2 space-y-2"><div className="flex justify-between items-center"><h2 className="font-bold text-slate-900">{tr('Google Drive · สำรองข้อมูล','Google Drive · Backup')}</h2><button type="button" disabled={applyingRestore} onClick={()=>{if(!busy){setRecoveryOpen(false);setAdvanced(false);}onClose();}} className="border border-slate-300 rounded px-3 py-1 text-slate-800 font-semibold disabled:opacity-50">{busy?tr('ซ่อนหน้าต่าง','Minimize'):tr('ปิด','Close')}</button></div>
 {msg&&<div role="status" aria-live="polite" className="rounded-lg border border-slate-300 bg-slate-50 p-2 text-sm text-slate-900 break-words">{busy&&<span className="inline-block mr-2 w-3 h-3 rounded-full border-2 border-current border-r-transparent animate-spin"/>}{msg}</div>}
 {busy&&!applyingRestore&&<button type="button" disabled={cancelling} onClick={cancel} className="text-sm font-semibold text-red-700 underline">{tr('ยกเลิกการดำเนินการ','Cancel operation')}</button>}
 </div>
 <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2 text-sm">
 {link?<><div className="font-semibold break-all">{link.email}</div><div className={'text-xs font-semibold '+(validToken(userId)?'text-emerald-700':'text-amber-700')}>{validToken(userId)?tr('Google พร้อมใช้งาน','Google authorized'):tr('จดจำบัญชีแล้ว แต่ต้องยืนยันสิทธิ์ Google','Account remembered; Google authorization required')}</div></>:<div className="text-xs">{tr('ยังไม่ได้เชื่อม Google Drive','Google Drive not connected')}</div>}
 {(!link||!validToken(userId))&&<button type="button" disabled={!ready||busy} onClick={()=>connect('connect',!link)} className="rounded-lg bg-blue-700 text-white px-3 py-2 text-sm font-semibold disabled:opacity-50">{tr('ยืนยัน Google','Authorize Google')}</button>}
 </div>
 <div className="grid grid-cols-2 gap-2 text-sm">
  <div className="rounded-lg border border-slate-200 p-3"><strong>{tr('ในเครื่องนี้','This device')}</strong><div className="mt-1 font-bold">{localSummary?describe(localSummary):'—'}</div></div>
  <div className="rounded-lg border border-slate-200 p-3"><strong>Google Drive</strong><div className="mt-1 font-bold text-emerald-700">{cloud?describe(cloud):'—'}</div>{cloud&&<div className="mt-1 text-xs text-slate-500">{showTime(cloud.date)}{!checkedAt&&(' · '+tr('ข้อมูลครั้งก่อน','Last known'))}</div>}</div>
 </div>
 <button data-tour="drive-json-send" disabled={!ready||busy} onClick={()=>connect('publish')} className="w-full rounded-lg bg-emerald-700 text-white p-3 font-bold disabled:opacity-50">{tr('ส่ง JSON ล่าสุดขึ้น Drive','Send latest JSON to Drive')}</button>
 <button data-tour="drive-json-load" disabled={!ready||busy} onClick={()=>connect('download')} className="w-full rounded-lg bg-blue-700 text-white p-3 font-bold disabled:opacity-50">{tr('โหลด JSON ล่าสุดจาก Drive','Load latest JSON from Drive')}</button>
 <div className="rounded-lg border border-slate-200 p-3 space-y-1">{switchControl}<p className="text-xs text-slate-500">{tr('ตรวจทุก 20 วินาทีเมื่อเปิดเว็บและ Google พร้อมใช้งาน ไม่เขียนทับงานที่ขัดแย้งกัน','Checks every 20 seconds while open and authorized; conflicting work is not overwritten.')}</p></div>
 <details open={advanced||recoveryOpen} onToggle={e=>{setAdvanced(e.currentTarget.open);if(!e.currentTarget.open&&!busy)setRecoveryOpen(false);}} className="border-t border-slate-200 pt-3 space-y-3">
 <summary className="cursor-pointer text-sm font-semibold text-slate-700">{tr('เพิ่มเติม · กู้คืน / ตั้งค่า','More · Recovery / settings')}</summary>
 {checkedAt&&<p className="text-xs text-slate-500">{tr('ตรวจ Drive ล่าสุด: ','Last checked: ')}{showTime(checkedAt)}</p>}
 {cloud&&!cloud.legacy&&<a href={'https://drive.google.com/open?id='+encodeURIComponent(cloud.id)} target="_blank" rel="noopener noreferrer" className="block text-xs text-blue-700 underline">{tr('เปิดไฟล์ JSON บน Drive','Open JSON on Drive')}</a>}
 <button disabled={!ready||busy||!link} onClick={()=>connect('sync')} className="w-full rounded border border-emerald-600 text-emerald-700 p-2 text-sm disabled:opacity-50">{tr('ตรวจและรวมข้อมูล','Check and merge')}</button>
 <button disabled={!ready||busy||!link} onClick={()=>connect('recover')} className="w-full rounded border border-slate-300 p-2 text-sm disabled:opacity-50">{tr('กู้คืนแฟ้มที่ขาด','Recover missing projects')}</button>
 <button data-tour="drive-recover" disabled={!ready||busy||!link} onClick={()=>connect('browse')} className="w-full rounded border border-indigo-500 text-indigo-700 p-2 text-sm disabled:opacity-50">{tr('เลือก JSON สำรองย้อนหลัง','Choose previous JSON backup')}</button>
 {recoveryOpen&&<section className="rounded-xl border border-indigo-300 p-3 space-y-3">
  <div className="flex justify-between items-center gap-2"><strong>{tr('เลือกฉบับสำรอง','Select backup version')}</strong><button type="button" disabled={busy} onClick={()=>{setRecoveryOpen(false);setRecoveryData(null);setPreview([]);}} className="text-xs underline">{tr('ปิดรายการ','Close list')}</button></div>
  <p className="text-xs text-slate-600">{tr('เลือก TIS FullBackup JSON หรือ Workspace เพื่อกู้แฟ้มพร้อมข้อมูลรายงาน หรือเลือกไฟล์ข้อมูลโครงการแยก หากฉบับล่าสุดไม่ใช่ที่ต้องการให้ลองฉบับก่อนหน้า','Choose TIS FullBackup JSON or Workspace for projects with report settings, or a single project backup. If the latest is not correct, inspect earlier versions.')}</p>
  <div className="max-h-48 overflow-y-auto space-y-1">{sources.map(source=><button key={source.id} disabled={busy} type="button" onClick={()=>void inspectBackup(source)} className={'block w-full text-left rounded-lg border p-2 text-xs '+(selectedSource?.id===source.id?'border-indigo-500 bg-indigo-50':'border-slate-200')}><strong>{source.kind==='json'?'TIS FullBackup JSON':source.kind==='workspace'?'Workspace':tr('ข้อมูลโครงการ','Project data')}</strong> · {new Date(source.date).toLocaleString(lang==='th'?'th-TH':'en-GB')}<br/>{source.name}</button>)}</div>
  {recoveryData&&<><div className="rounded-lg bg-slate-50 p-2 text-xs">{selectedSource?.kind==='project'?tr('ไฟล์โครงการแยก: กู้เป็นแฟ้มใหม่เท่านั้น ไม่รวมข้อมูลเล่มรายงานแยก','Single project file: restore as a separate copy only; separate report settings are not included.'):tr('เลือกวิธีกู้คืนเมื่อมีแฟ้มรหัสเดียวกัน','Choose how to restore a matching project ID')}{selectedSource?.kind!=='project'&&<select value={restoreMode} onChange={e=>setRestoreMode(e.target.value==='replace'?'replace':'copy')} disabled={busy} className="block w-full mt-2 border rounded p-2"><option value="copy">{tr('เก็บทั้งสองฉบับ (แนะนำ)','Keep both versions (recommended)')}</option><option value="replace">{tr('แทนที่แฟ้มเดิมหลังยืนยัน','Replace existing after confirmation')}</option></select>}</div>
  {preview.map(item=><div key={item.id} className="rounded-lg border border-slate-200 p-3 space-y-2"><strong className="text-sm break-words">{item.name}</strong><div className="grid grid-cols-2 gap-2 text-xs"><div>{tr('ในเครื่อง','Local')}: {item.localCount===null?tr('ยังไม่มี','Missing'):item.localCount} {tr('ข้อ','defects')}</div><div className="font-bold text-emerald-700">Drive: {item.cloudCount} {tr('ข้อ','defects')}</div></div><button type="button" disabled={busy||item.identical} onClick={()=>void restoreProject(item.id)} className="w-full rounded bg-emerald-700 text-white p-2 text-sm disabled:opacity-50">{item.identical?tr('ข้อมูลตรงกันแล้ว','Already identical'):tr('กู้คืนแฟ้มนี้','Restore this project')}</button></div>)}</>}
 </section>}
 <h3 className="font-semibold text-sm border-t pt-3">{tr('2. ส่งไฟล์ไปยัง Google Drive','2. Export files to Google Drive')}</h3>
 <button disabled={!ready||busy||!link} onClick={()=>connect('export')} className="w-full rounded bg-blue-800 text-white p-3 disabled:opacity-50">{tr('ส่งไฟล์ไปยัง Google Drive','Export files to Google Drive')}</button>
 {link?.lastExport&&<p className="text-xs text-slate-500">{tr('ส่งไฟล์ล่าสุด: ','Last export: ')}{new Date(link.lastExport).toLocaleString(lang==='th'?'th-TH':'en-GB')}</p>}

 {link?.folder&&/^[A-Za-z0-9_-]+$/.test(link.folder)&&<a className="block text-center rounded border border-slate-300 p-3 font-semibold text-blue-800" href={'https://drive.google.com/drive/folders/'+link.folder} target="_blank" rel="noopener noreferrer">{tr('เปิดโฟลเดอร์ Google Drive','Open Google Drive folder')}</a>}
 {link&&<div className="flex justify-between gap-2"><button disabled={!ready||busy} onClick={()=>connect('connect',false)} className="text-xs underline">{tr('ยืนยันสิทธิ์อีกครั้ง','Renew authorization')}</button><button disabled={busy} onClick={async()=>{if(!window.confirm(tr('ยกเลิกการจดจำบัญชีบนเครื่องนี้? ไฟล์ Drive และแฟ้มงานจะไม่ถูกลบ','Forget this Google account on this device? No Drive or local files will be deleted.')))return;clearDriveSession();setToken('');try{workspaceStorage.removeItem(LINK);workspaceStorage.setItem(AUTO,'0');if(!await flushWorkspace())throw Error('Local save failed');setLink(null);setCloud(null);setCheckedAt('');setAuto(false);setMsg(tr('ยกเลิกการจดจำบัญชีแล้ว','Account link forgotten'));}catch(e){setMsg(String(e));}}} className="text-xs text-red-700 underline">{tr('ยกเลิกการเชื่อมต่อ','Disconnect')}</button></div>}
 </details>
 {busy&&!applyingRestore&&<p className="text-xs text-slate-600">{tr('กดซ่อนหน้าต่างเพื่อทำงานอื่นต่อได้ โดยงานจะทำต่อขณะเปิดเว็บนี้ไว้','Minimize to continue other work. Keep this app open until the operation finishes.')}</p>}

 </section></div>;
}
