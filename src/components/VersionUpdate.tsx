import React, { useEffect, useState } from 'react';
import type { AppLanguage } from '../types/inspection';

type Release = {version:string; date:string; notes:string; build:number; storageSchema?:number};
type Manifest = {latest:string; releases:Release[]};
const PIN = 'tis_preferred_release_v1';
const VERSION = /^v1\.0\.\d+$/;
const route = window.location.pathname.match(/^(.*\/)(?:versions)\/(v1\.0\.\d+)(?:\/|$)/);
const current = route?.[2] || '';
const root = route?.[1] || '';
export function VersionUpdate({lang,onBackup,onPrepare}:{lang:AppLanguage;onBackup:()=>Promise<boolean>;onPrepare:()=>Promise<boolean>}) {
 const en=lang==='en', tr=(th:string,eng:string)=>en?eng:th;
 const [manifest,setManifest]=useState<Manifest|null>(null);
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false);
 const [error,setError]=useState(''),[backedVersion,setBackedVersion]=useState('');
 async function load() {
   if(!current)return;
   try {
     const r=await fetch(root+'release-index.json',{cache:'no-store',signal:AbortSignal.timeout(8000)});
     if(!r.ok)throw Error('Manifest unavailable');
     const m=await r.json() as Manifest;
     if(!VERSION.test(m.latest)||!Array.isArray(m.releases)||!m.releases.some(v=>v.version===m.latest))throw Error('Invalid manifest');
     const compatible=m.releases.filter(v=>VERSION.test(v.version)&&v.storageSchema===2);
     setManifest({...m,releases:compatible});setError('');
     // A user who explicitly opens and logs into a newer compatible release
     // should not be sent back to the older pinned release on their next visit.
     if(compatible.some(r=>r.version===current)){
       try{const pinned=localStorage.getItem(PIN)||'';if(!VERSION.test(pinned)||Number(current.split('.').pop())>Number(pinned.split('.').pop()))localStorage.setItem(PIN,current);}catch{/* storage unavailable */}
     }
   }catch{setManifest(null);setError(tr('ยังตรวจสอบเวอร์ชันล่าสุดไม่ได้','Cannot check the latest version'));}
 }
 useEffect(()=>{if(!current)return;void load();const timer=window.setInterval(()=>void load(),120000);return()=>clearInterval(timer);},[lang]);
 useEffect(()=>{if(!open)return;const key=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!busy)setOpen(false);};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[open,busy]);
 if(!current)return null;
 const target=manifest?.releases.find(r=>r.version===manifest.latest&&r.storageSchema===2);
 const newer=!!target&&Number(target.version.split('.').pop())>Number(current.split('.').pop());
 const backed=!!target&&backedVersion===target.version;
 async function backup(){
   if(!target||!newer)return;
   const backupFor=target.version;
   setBusy(true);setError('');setBackedVersion('');
   try{if(await onBackup())setBackedVersion(backupFor);else setError(tr('ยังไม่ได้สำรองข้อมูล กรุณาลองอีกครั้ง','Backup was not completed. Try again.'));}
   catch{setError(tr('สำรองข้อมูลไม่สำเร็จ','Backup failed'));}
   finally{setBusy(false);}
 }
 async function switchVersion(){
   if(busy||!target||!newer)return;
   if(!window.confirm(tr('อัปเดตเป็นเวอร์ชันล่าสุดหรือไม่? ระบบจะบันทึกงานลงเครื่องก่อนเปิดเวอร์ชันใหม่ โปรดบันทึกงานร่างและปิดแท็บอื่นก่อน','Update now? Save drafts and close other tabs. The local workspace will be saved before opening the new version.')))return;
   setBusy(true);setError('');
   try{
     if(!await onPrepare())throw Error('Local save failed');
     localStorage.setItem(PIN,target.version);
     window.location.assign(root+'versions/'+target.version+'/');
   }catch{setError(tr('ยังอัปเดตไม่ได้ กรุณาตรวจสอบการบันทึกข้อมูลหรือสำรอง JSON ก่อนลองใหม่','Cannot update. Check local saving or export a JSON backup before retrying.'));setBusy(false);}
 }
 return <>
 <button type="button" onClick={()=>{setOpen(true);setBackedVersion('');void load();}} className={'px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 '+(newer?'bg-orange-50 border-orange-200 text-orange-700':'bg-slate-50 border-slate-200 text-slate-700')}>
  {current.toUpperCase()} · {tr('อัปเดตเวอร์ชัน','Updates')}{newer&&<span className="w-2 h-2 bg-orange-500 rounded-full" aria-label={tr('มีเวอร์ชันใหม่','New version')}/>}
 </button>
 {open&&<div className="fixed inset-0 z-[100] bg-slate-900/50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={tr('อัปเดตเวอร์ชัน','Version updates')}>
 <div className="bg-white rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-xl max-h-[90vh] overflow-auto">
 <h2 className="text-lg font-bold">{tr('อัปเดตโปรแกรม','Program updates')}</h2>
 <p className="text-sm text-slate-600">{tr('เลือกใช้เวอร์ชันเดิมต่อได้ โปรแกรมจะไม่บังคับเปลี่ยนเวอร์ชัน','You can keep using your current version. Updates are optional.')}</p>
 <div className="grid grid-cols-2 gap-3"><div className="rounded-xl bg-slate-100 p-3"><p className="text-xs">{tr('ปัจจุบัน','Current')}</p><strong>{current.toUpperCase()}</strong></div><div className="rounded-xl bg-blue-50 p-3"><p className="text-xs">{tr('ล่าสุด','Latest')}</p><strong>{manifest?.latest.toUpperCase()||'—'}</strong></div></div>
 {manifest&&target&&!newer&&<p className="text-sm font-semibold text-emerald-700">{tr('ไม่มีเวอร์ชันใหม่ให้ดาวน์โหลด','No newer compatible release is available.')}</p>}
 {target&&<div className="text-sm bg-slate-50 p-3 rounded-xl whitespace-pre-wrap"><strong>{tr('รายละเอียดเวอร์ชัน','Release notes')}</strong><p>{target.date.slice(0,10)} · {target.notes}</p></div>}
 <p className="text-xs text-slate-600">{tr('เมื่ออัปเดต ระบบจะบันทึกงานลงเครื่องก่อนโดยอัตโนมัติ โครงการ รูปภาพ และรายงานจะอยู่ในบัญชีเดิมบนเบราว์เซอร์นี้ ไม่ต้องนำเข้าใหม่ สามารถดาวน์โหลดไฟล์สำรองเพิ่มเติมได้ตามต้องการ','Updates save the local workspace before switching. Projects, photos and reports remain in the same account on this browser. A downloadable backup is optional.')}</p>
 {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
 {backed&&<p className="text-sm text-emerald-700">{tr('สร้างไฟล์สำรองเพิ่มเติมแล้ว','Optional backup generated.')}</p>}
 <div className="flex flex-wrap gap-2 justify-end"><button type="button" disabled={busy} className="border rounded-lg px-3 py-2 text-sm" onClick={()=>setOpen(false)}>{tr('อัปเดตภายหลัง','Later')}</button><button type="button" disabled={busy||!newer} onClick={backup} className="bg-blue-100 text-blue-800 rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-50">{busy?tr('กำลังสำรอง…','Backing up…'):tr('สำรองไฟล์เพิ่มเติม','Export backup')}</button><button type="button" disabled={busy||!newer} onClick={()=>void switchVersion()} className="bg-blue-700 text-white rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-50">{tr('อัปเดตเป็นเวอร์ชันล่าสุด','Update to latest')}</button></div>
 </div></div>}
 </>;
}
