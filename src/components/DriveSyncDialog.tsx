import React,{useEffect,useRef,useState} from 'react';
import {flushSync} from 'react-dom';
import type {AppLanguage} from '../types/inspection';
import {mirrorWorkspace} from '../utils/driveVisibleBackup';
import {mergeDriveRecords,readVisibleWorkspace,recoverVisibleRecords,validateDriveRecords,listRecoverySources,readRecoverySource,recoveryPreview,restoreSelectedProject,type DriveRecoverySource} from '../utils/driveRecovery';
import {readSyncRecords,restoreSyncRecords,workspaceStorage,flushWorkspace} from '../utils/workspaceStorage';

const SCOPE='https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/drive.file';
const ROOT='https://www.googleapis.com/drive/v3/files';
const MARK='tis_drive_sync_marker_v1';
// Public OAuth client identifier; never include a client secret in this web app.
const CLIENT_ID='386487455938-nda2mj55c5f3cdr8pvqmq4pu4o775fv2.apps.googleusercontent.com';
type Records=Record<string,string>;
type FileMeta={id:string;appProperties?:Record<string,string>;createdTime?:string;name?:string};
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
async function hash(records:Records){
 const str=JSON.stringify(Object.entries(records).map(([key,value])=>[key,JSON.stringify(JSON.parse(value))]).sort(([a],[b])=>a.localeCompare(b)));
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(str)))).map(n=>n.toString(16).padStart(2,'0')).join('');
}
async function api(token:string,url:string,init:RequestInit={}){
 const result=await fetch(url,{...init,headers:{...init.headers,Authorization:'Bearer '+token},cache:'no-store'});
 if(!result.ok)throw Error('Google Drive HTTP '+result.status);
 return result;
}
const PROJECTS='tis_wl_projects_v10',BRAND='tis_wl_brand_v10',REPORT='tis_report_book_v1_';
function counts(records:Records){
 const p=JSON.parse(records[PROJECTS]||'[]') as {defects:unknown[]}[];
 return {projects:p.length,defects:p.reduce((n,x)=>n+x.defects.length,0)};
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
async function readSnapshot(token:string,userId:string,id:string,signal?:AbortSignal):Promise<Snapshot>{
 const data=await (await api(token,ROOT+'/'+encodeURIComponent(id)+'?alt=media',{signal})).json();
 if(data.userId!==userId)throw Error('Backup account mismatch');
 if(data.format==='TIS_DRIVE_V1')return {...data,records:validateDriveRecords(data.records)};
 if(data.format!=='TIS_HOME_INSPECTION_BACKUP_V10'||!Array.isArray(data.projects)||!data.reportBooks||typeof data.reportBooks!=='object')throw Error('Invalid JSON backup');
 const records:Records={[PROJECTS]:JSON.stringify(data.projects)};
 if(data.brand&&typeof data.brand==='object')records[BRAND]=JSON.stringify(data.brand);
 for(const [id,report] of Object.entries(data.reportBooks))records[REPORT+id]=JSON.stringify(report);
 validateDriveRecords(records);
 if(data.contentHash!==await hash(records))throw Error('JSON backup integrity check failed');
 return {format:'TIS_DRIVE_V1',userId,records};
}
async function jsonFolder(token:string,userId:string,signal?:AbortSignal){
 const q=new URLSearchParams({spaces:'drive',q:"trashed = false and mimeType = 'application/vnd.google-apps.folder' and appProperties has { key='tisOwner' and value='"+userId+"' } and appProperties has { key='tisFolder' and value='latest-json' }",fields:'files(id)',pageSize:'100'});
 const matches=await (await api(token,ROOT+'?'+q,{signal})).json();
 if(matches.files?.[0]?.id)return matches.files[0].id as string;
 const folder=await (await api(token,ROOT+'?fields=id',{method:'POST',signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'TIS - Latest JSON backups',mimeType:'application/vnd.google-apps.folder',appProperties:{tisOwner:userId,tisFolder:'latest-json'}})})).json();
 if(!folder.id)throw Error('Drive folder not confirmed');return folder.id as string;
}
async function upload(token:string,userId:string,records:Records,parent:string,signal?:AbortSignal){
 validateDriveRecords(records);
 const folder=await jsonFolder(token,userId,signal);
 const projects=JSON.parse(records[PROJECTS]),reportBooks:Record<string,unknown>={};
 for(const [key,value] of Object.entries(records))if(key.startsWith(REPORT))Object.defineProperty(reportBooks,key.slice(REPORT.length),{value:JSON.parse(value),enumerable:true});
 const exportedAt=new Date().toISOString(),contentHash=await hash(records),c=counts(records);
 const snapshot={format:'TIS_HOME_INSPECTION_BACKUP_V10',exportedAt,userId,contentHash,brand:records[BRAND]?JSON.parse(records[BRAND]):undefined,projects,reportBooks};
 const boundary='tis_'+crypto.randomUUID().replace(/-/g,'');
 const metadata={name:'TIS_FullBackup_'+exportedAt.replace(/[:.]/g,'-')+'.json',parents:[folder],mimeType:'application/json',appProperties:{tisUser:userId,tisJson:'1',parent:parent||'root',projects:String(c.projects),defects:String(c.defects),hash:contentHash}};
 const body=new Blob(['--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n',JSON.stringify(metadata),'\r\n--'+boundary+'\r\nContent-Type: application/json\r\n\r\n',JSON.stringify(snapshot),'\r\n--'+boundary+'--\r\n']);
 const r=await api(token,'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,createdTime,appProperties',{method:'POST',headers:{'Content-Type':'multipart/related; boundary='+boundary},body});
 const data=await r.json() as FileMeta;if(typeof data.id!=='string'||!cloudInfo(data,records))throw Error('Upload not confirmed');
 return data;
}
export function DriveSyncDialog({userId,lang,visible,paused,canAutoRestore,onClose,onRestored,onOpen,onBusyChange}:{userId:string;lang:AppLanguage;visible:boolean;paused:boolean;canAutoRestore:()=>boolean;onClose:()=>void;onRestored:()=>void;onOpen:()=>void;onBusyChange:(busy:boolean)=>void}){
 const tr=(th:string,en:string)=>lang==='en'?en:th;
 const [ready,setReady]=useState(!!gis()),[,setToken]=useState(()=>validToken(userId)),[busy,setBusy]=useState(false),[msg,setMsg]=useState('');
 const [link,setLink]=useState<Identity|null>(readLink);
 const [cloud,setCloud]=useState<CloudSummary|null>(()=>readLink()?.lastCloud||null);
 const [checkedAt,setCheckedAt]=useState('');
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
  if(!gis()||operation.current||paused)return;
  autoHold.current=false;
  const op=new AbortController();operation.current=op;setBusy(true);setCancelling(false);setMsg('');
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
      if(action==='connect')setMsg(tr('เชื่อมต่อ '+email+' แล้ว ยังไม่ได้ส่งไฟล์งาน','Connected to '+email+'. No work files sent yet.'));
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
 async function browseBackups(token:string,op:AbortController){
  autoHold.current=true;setRecoveryOpen(true);setSources([]);setSelectedSource(null);setRecoveryData(null);setPreview([]);
  setMsg(tr('กำลังค้นหาสำรอง Workspace และข้อมูลโครงการใน Drive…','Finding workspace and project backups…'));
  const result=await listRecoverySources(token,userId,op.signal);check(op);setSources(result);
  setMsg(result.length?tr('พบไฟล์สำรอง '+result.length+' ไฟล์ เลือกฉบับเพื่อตรวจจำนวน Defect','Found '+result.length+' backups. Select a version to compare defect counts.'):tr('ไม่พบไฟล์สำรอง JSON ของบัญชีนี้','No JSON backups for this account.'));
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
 async function publishLatest(token:string,op:AbortController){
  const records=await readSyncRecords();check(op);const c=counts(records);
  if(!c.projects)throw Error(tr('ไม่ส่งข้อมูลว่างขึ้น Drive','Cannot publish an empty workspace'));
  const remote=await files(token,userId,op.signal,true);check(op);
  const prior=remote?(cloudInfo(remote)||cloudInfo(remote,(await readSnapshot(token,userId,remote.id,op.signal)).records)):null;check(op);
  if(!window.confirm(tr('ส่ง JSON จากเครื่องนี้เป็นฉบับล่าสุดบน Drive: ','Publish this device as the latest Drive JSON: ')+describe(c)+(prior?'\nDrive: '+describe(prior)+' · '+showTime(prior.date):'')+'\n'+tr('ฉบับก่อนหน้าจะยังอยู่ใน Drive ไม่ลบไฟล์เดิม ยืนยันเฉพาะเมื่อเครื่องนี้มีงานล่าสุดจริง','Previous versions are retained. Confirm only if this device has the intended latest work.')))return;
  check(op);if((await files(token,userId,op.signal,true))?.id!==remote?.id)throw Error('CONFLICT');
  const current=await readSyncRecords();if(await hash(current)!==await hash(records))throw Error(tr('งานเปลี่ยนระหว่างยืนยัน กรุณากดส่งอีกครั้ง','Work changed during confirmation; publish again.'));
  check(op);setMsg(tr('กำลังส่ง JSON ฉบับล่าสุด…','Uploading latest JSON…'));
  const file=await upload(token,userId,records,remote?.id||'',op.signal);check(op);
  workspaceStorage.setItem(MARK,JSON.stringify({id:file.id,hash:await hash(records)}));if(!await flushWorkspace())throw Error('Local marker save failed');
  await rememberCloud(file,records);check(op);
  const identity=readLink();if(identity)await saveLink({...identity,lastSync:new Date().toISOString()});
  setCheckedAt(new Date().toISOString());setMsg(tr('ส่ง JSON ล่าสุดสำเร็จ · ','Latest JSON uploaded · ')+describe(c)+' · '+showTime(file.createdTime!));
 }
 async function sync(downloadOnly:boolean,token:string,op:AbortController,automatic=false){
  setMsg(tr('กำลังตรวจสอบข้อมูลซิงค์…','Checking sync data…'));
  {
   const records=await readSyncRecords(),localHash=await hash(records);check(op);
   const localProjects=JSON.parse(records.tis_wl_projects_v10||'[]');
   const empty=Array.isArray(localProjects)&&localProjects.length===0&&!Object.keys(records).some(k=>k.startsWith('tis_report_book_v1_'));
   let marker:Marker|null=null;try{marker=JSON.parse(workspaceStorage.getItem(MARK)||'null');}catch{}
   const remote=await files(token,userId,op.signal);check(op);setCheckedAt(new Date().toISOString());
   if(remote){setCloud(cloudInfo(remote));}else setCloud(null);
   async function finish(confirmed:Records,message:string){
    if(!active.current||operation.current!==op)return;
    const identity=readLink();if(!identity)throw Error('Missing Google account link');
    await saveLink({...identity,lastSync:new Date().toISOString()});
    if(op.signal.aborted){cancelled(op);return;}
    setMsg(message+' · '+describe(counts(confirmed)));
   }
   if(!remote){
    // Recover the latest verified visible backup on an empty device before any initial upload.
    if(empty&&await recoverBackup(token,op,automatic))return;
    if(downloadOnly||empty){setMsg(tr('ไม่พบแฟ้มงานบน Google Drive ของบัญชีนี้ กรุณาตรวจสอบว่าเลือกบัญชี Google และบัญชีโปรแกรมเดียวกับเครื่องที่ส่งข้อมูลแล้ว ระบบไม่ได้ส่งข้อมูลว่างขึ้นไป','No cloud workspace found. Check that both the Google and app accounts match the device that uploaded the work. No empty workspace was uploaded.'));return;}
    if(marker)throw Error('CONFLICT');
    if(automatic){setMsg(tr('ยังไม่ได้ส่งข้อมูลครั้งแรก กรุณากดซิงค์ด้วยตนเองหนึ่งครั้ง','First upload requires one manual sync.'));return;}
    if(!window.confirm(tr('ส่งแฟ้มงาน รูปภาพ แปลน และรายงานของบัญชีนี้ไปยัง Google Drive ที่เพิ่งเลือกหรือไม่?','Send this account’s projects, photos, plans and reports to the selected Google Drive?')))return;
    check(op);const file=await upload(token,userId,records,'',op.signal),id=file.id;
    if(!active.current)return;
    check(op);workspaceStorage.setItem(MARK,JSON.stringify({id,hash:localHash}));if(!await flushWorkspace())throw Error('Local marker save failed');
    await rememberCloud(file,records);
    await finish(records,tr('ส่งข้อมูลครั้งแรกสำเร็จ','First upload completed'));return;
   }
   if(marker?.id===remote.id&&marker.hash===localHash&&!downloadOnly){await rememberCloud(remote,records);await finish(records,tr('ข้อมูลตรงกันแล้ว','Already synchronized'));return;}
   if(marker?.id===remote.id&&!downloadOnly){
    if(!automatic&&!window.confirm(tr('ส่งงานที่แก้ไขล่าสุดไปยัง Google Drive หรือไม่?','Upload your latest saved changes?')))return;
    if((await files(token,userId,op.signal))?.id!==remote.id)throw Error('CONFLICT');check(op);
    check(op);const file=await upload(token,userId,records,remote.id,op.signal),id=file.id;
    if(!active.current)return;
    check(op);workspaceStorage.setItem(MARK,JSON.stringify({id,hash:localHash}));if(!await flushWorkspace())throw Error('Local marker save failed');
    await rememberCloud(file,records);
    await finish(records,tr('อัปโหลดข้อมูลล่าสุดแล้ว','Latest saved work uploaded'));return;
   }
   const data=await readSnapshot(token,userId,remote.id,op.signal);
   if(data.format!=='TIS_DRIVE_V1'||data.userId!==userId||!data.records||typeof data.records!=='object')throw Error('Invalid snapshot');
   const remoteHash=await hash(data.records);check(op);await rememberCloud(remote,data.records);check(op);
   if(remoteHash===localHash){workspaceStorage.setItem(MARK,JSON.stringify({id:remote.id,hash:localHash}));if(!await flushWorkspace())throw Error('Local marker save failed');await finish(records,tr('ข้อมูลตรงกันแล้ว','Already synchronized'));return;}
   validateDriveRecords(data.records);
   const remoteProjects=JSON.parse(data.records.tis_wl_projects_v10||'null');
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
   if(!remoteProjects.length&&localProjects.length){setMsg(tr('แฟ้มบน Drive ว่าง แต่เครื่องนี้มีงาน ระบบไม่โหลดทับ','Cloud workspace is empty but this device has work. Restore stopped.'));return;}
   if(!safeRestoreRef.current()){setMsg(tr('มีข้อมูลใหม่บน Drive '+remoteProjects.length+' แฟ้ม จะรับเมื่อกลับหน้าแฟ้มโครงการ','New cloud data: '+remoteProjects.length+' projects. Download deferred until the project list is idle.'));return;}
   if(!automatic&&!window.confirm(tr('ข้อมูลในเครื่อง: ','Local: ')+describe(counts(records))+'\nDrive: '+describe(counts(data.records))+' · '+(remote.createdTime?showTime(remote.createdTime):tr('ไม่ทราบเวลาไฟล์','Unknown file time'))+'\n'+tr(downloadOnly?'ใช้ JSON ล่าสุดบน Drive แทนข้อมูลในเครื่องหรือไม่? ระบบเก็บข้อมูลก่อนโหลดไว้ในเครื่อง':'รับและรวมข้อมูลจาก Drive หรือไม่? ระบบเก็บข้อมูลก่อนโหลดไว้ในเครื่อง',downloadOnly?'Replace local data with latest Drive JSON? The previous local snapshot is retained.':'Receive and merge Drive data? The previous local snapshot is retained.')))return;
   if((await files(token,userId,op.signal))?.id!==remote.id)throw Error('CONFLICT');check(op);
   if(!active.current)return;
   check(op);if(!safeRestoreRef.current()){setMsg(tr('พบข้อมูลใหม่บน Drive กรุณากลับหน้าแฟ้มโครงการแล้วกดซิงค์อีกครั้ง','New cloud data found. Return to the project list and sync again.'));return;}
   // Only the local replacement transaction needs to block edits. Uploads and remote checks remain non-modal.
   flushSync(()=>setApplyingRestore(true));
   try{
    check(op);if(!safeRestoreRef.current())throw Error(tr('กรุณากลับหน้าแฟ้มโครงการก่อนโหลดข้อมูล','Return to the project list before restoring.'));
    await restoreSyncRecords(incoming,records,JSON.stringify({id:remote.id,hash:remoteHash}));
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
   if(!access){setMsg(tr('ซิงค์อัตโนมัติรอยืนยัน Google — เปิดหน้าซิงค์แล้วกดปุ่มสีเขียว','Auto sync needs Google authorization. Open sync and press the green button.'));return;}
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
 <div className="flex justify-between items-center"><h2 className="font-bold text-slate-900">Google Drive Sync · {tr('ทดลอง','Beta')}</h2><button type="button" disabled={applyingRestore} onClick={()=>{if(!busy)setRecoveryOpen(false);onClose();}} className="border border-slate-300 rounded px-3 py-1 text-slate-800 font-semibold disabled:opacity-50">{busy?tr('ซ่อนหน้าต่าง','Minimize'):tr('ปิด','Close')}</button></div>
 <p className="text-sm text-slate-600">{tr('ซิงค์งานระหว่างอุปกรณ์ หรือเลือกส่งสำเนาไฟล์ไป My Drive แยกกัน ไม่ส่งรหัสผ่านหรือ Gemini API Key','Sync between devices or export visible copies to My Drive separately. Passwords and Gemini API keys are excluded.')}</p>
 {link&&<div className="rounded-lg bg-emerald-50 p-3 text-sm break-all"><strong>{tr('จดจำบัญชี Google แล้ว','Google account remembered')}</strong><div>{link.email}</div>{link.lastSync&&<div className="text-xs mt-1">{tr('ซิงค์ล่าสุด: ','Last sync: ')}{new Date(link.lastSync).toLocaleString(lang==='th'?'th-TH':'en-GB')}</div>}</div>}
 {!link&&<button disabled={!ready||busy} onClick={()=>connect('connect',true)} className="w-full rounded bg-blue-800 text-white p-3 disabled:opacity-50">{tr('เชื่อม Google Drive','Connect Google Drive')}</button>}
 <h3 className="font-semibold text-sm border-t pt-3">{tr('1. JSON ล่าสุดบน Google Drive','1. Latest JSON on Google Drive')}</h3>
 <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-1 text-sm">
  <strong>{tr('ข้อมูลล่าสุดใน Drive','Latest data on Drive')}</strong>
  {cloud?<><div className="font-bold text-emerald-700">{describe(cloud)}</div><div>{tr('เวลาบันทึกไฟล์: ','File saved: ')}{showTime(cloud.date)}</div><div className="text-xs text-slate-500">{cloud.legacy?tr('ไฟล์ซิงค์เดิม','Legacy sync file'):'TIS_FullBackup JSON'}</div></>:<p className="text-xs text-slate-500">{tr('ยังไม่มีข้อมูลยืนยัน กรุณากดซิงค์หรือโหลด JSON','Not verified yet. Sync or load JSON.')}</p>}
  {checkedAt&&<div className="text-xs text-slate-500">{tr('ตรวจ Drive ล่าสุด: ','Last checked: ')}{showTime(checkedAt)}</div>}
 </div>
 <button data-tour="drive-json-send" disabled={!ready||busy||!link} onClick={()=>connect('publish')} className="w-full rounded bg-emerald-700 text-white p-3 font-bold disabled:opacity-50">{tr('ส่ง JSON ล่าสุดขึ้น Google Drive','Publish latest JSON to Google Drive')}</button>
 <div className="rounded-lg border border-slate-200 p-3 space-y-1">{switchControl}<p className="text-xs text-slate-500">{tr('ตรวจ JSON ล่าสุดทุก 20 วินาทีขณะเปิดเว็บ ซิงค์หลังบันทึกเมื่อข้อมูลไม่ขัดแย้ง รับข้อมูลที่หน้าแฟ้มโครงการ และต้องยืนยัน Google ใหม่เมื่อสิทธิ์หมดอายุ','Check the latest JSON every 20 seconds while open, sync saved changes when conflict-free, receive on the idle project list, and renew Google authorization when expired.')}</p></div>
 <button disabled={!ready||busy||!link} onClick={()=>connect('sync')} className="w-full rounded bg-emerald-700 text-white p-3 disabled:opacity-50">{busy?tr('กำลังดำเนินการ…','Working…'):tr('ซิงค์ข้อมูลล่าสุด (ตรวจและรวม)','Sync latest (check and merge)')}</button>
 <button disabled={!ready||busy||!link} data-tour="drive-json-load" onClick={()=>connect('download')} className="w-full rounded border border-blue-700 text-blue-800 p-3 font-semibold disabled:opacity-50">{tr('โหลด JSON ล่าสุดจาก Drive ลงเครื่อง','Load latest JSON from Drive')}</button>
 <button disabled={!ready||busy||!link} onClick={()=>connect('recover')} className="w-full rounded border border-emerald-600 text-emerald-700 p-3 font-semibold disabled:opacity-50">{tr('กู้คืนแฟ้มที่ขาดจากข้อมูลสำรอง Drive','Recover missing projects from Drive backup')}</button>
 <p className="text-xs text-slate-500">{tr('อ่านไฟล์ Workspace JSON ล่าสุดของบัญชีนี้ เพิ่มเฉพาะแฟ้มที่ยังไม่มี ไม่เขียนทับแฟ้มเดิม','Read the latest account-owned Workspace JSON and recover missing projects without overwriting existing ones.')}</p>
 <button data-tour="drive-recover" disabled={!ready||busy||!link} onClick={()=>connect('browse')} className="w-full rounded border border-indigo-500 text-indigo-700 p-3 font-semibold disabled:opacity-50">{tr('ค้นหาและเลือกฉบับสำรองจาก Drive','Find and select a Drive backup version')}</button>
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
 {busy&&<button type="button" disabled={cancelling} onClick={cancel} className="w-full rounded border border-red-600 text-red-700 p-3 font-bold disabled:opacity-50">{cancelling?tr('กำลังยกเลิก…','Cancelling…'):tr('ยกเลิกการดำเนินการ','Cancel operation')}</button>}
 {link?.folder&&/^[A-Za-z0-9_-]+$/.test(link.folder)&&<a className="block text-center rounded border border-slate-300 p-3 font-semibold text-blue-800" href={'https://drive.google.com/drive/folders/'+link.folder} target="_blank" rel="noopener noreferrer">{tr('เปิดโฟลเดอร์ Google Drive','Open Google Drive folder')}</a>}
 {link&&<div className="flex justify-between gap-2"><button disabled={!ready||busy} onClick={()=>connect('connect',true)} className="text-xs underline">{tr('ยืนยันบัญชี Google ใหม่','Reconnect Google account')}</button><button disabled={busy} onClick={async()=>{if(!window.confirm(tr('ยกเลิกการจดจำบัญชีบนเครื่องนี้? ไฟล์ Drive และแฟ้มงานจะไม่ถูกลบ','Forget this Google account on this device? No Drive or local files will be deleted.')))return;clearDriveSession();setToken('');try{workspaceStorage.removeItem(LINK);workspaceStorage.setItem(AUTO,'0');if(!await flushWorkspace())throw Error('Local save failed');setLink(null);setCloud(null);setCheckedAt('');setAuto(false);setMsg(tr('ยกเลิกการจดจำบัญชีแล้ว','Account link forgotten'));}catch(e){setMsg(String(e));}}} className="text-xs text-red-700 underline">{tr('ยกเลิกการเชื่อมต่อ','Disconnect')}</button></div>}
 {msg&&<div role="status" className="text-sm bg-slate-100 rounded p-3 break-words"><p>{msg}</p>{busy&&progress&&<progress aria-label={tr('ความคืบหน้าการส่งไฟล์','File export progress')} value={progress.done} max={progress.total} className="mt-2 w-full h-2 accent-emerald-600"/>}</div>}
 {busy&&!applyingRestore&&<p className="text-xs text-slate-600">{tr('กดซ่อนหน้าต่างเพื่อทำงานอื่นต่อได้ โดยงานจะทำต่อขณะเปิดเว็บนี้ไว้','Minimize to continue other work. Keep this app open until the operation finishes.')}</p>}
 <p className="text-xs text-slate-500">{tr('กดซิงค์หลังบันทึกงาน ใช้บัญชีเดิมทั้งสองเครื่อง หาก Google หมดอายุสิทธิ์อาจเปิดหน้าขออนุญาตอีกครั้ง สำเนาใน My Drive เก็บรุ่นเก่าไว้และใช้กู้คืนแฟ้มที่ขาดได้ผ่านปุ่มกู้คืน','Sync after saving. Use the same accounts on both devices. Google may request authorization again when access expires. Visible copies retain older versions; use Recover missing projects to restore from a workspace backup.')}</p>
 </section></div>;
}
