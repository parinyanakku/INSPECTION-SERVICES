import React, { useEffect, useState } from 'react';
import type { AppLanguage } from '../types/inspection';

type Release = {version:string; date:string; notes:string; build:number; storageSchema?:number};
type Manifest = {latest:string; releases:Release[]};
const PIN = 'tis_preferred_release_v1';
const VERSION = /^v1\.0\.\d+$/;
const route = window.location.pathname.match(/^(.*\/)(?:versions)\/(v1\.0\.\d+)(?:\/|$)/);
const current = route?.[2] || '';
const root = route?.[1] || '';
export function VersionUpdate({lang,onBackup}:{lang:AppLanguage;onBackup:()=>Promise<boolean>}) {
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
     setManifest({...m,releases:m.releases.filter(v=>VERSION.test(v.version)&&v.storageSchema===2)});setError('');
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
 function switchVersion(){
   if(!backed||!target||!newer)return;
   if(!window.confirm(tr('ตรวจสอบว่าไฟล์สำรองถูกบันทึกแล้ว และปิดแท็บโปรแกรมอื่นก่อนสลับเวอร์ชัน','Confirm the backup was saved and close other app tabs before switching.')))return;
   try{localStorage.setItem(PIN,target.version);window.location.assign(root+'versions/'+target.version+'/');}
   catch{setError(tr('ไม่สามารถบันทึกเวอร์ชันที่เลือกได้','Cannot save the selected version'));}
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
 <p className="text-xs text-slate-600">{tr('สำรองโครงการ รูปภาพ และข้อมูลรายงานก่อนอัปเดตเป็นเวอร์ชันล่าสุด ข้อมูลยังเก็บในพื้นที่บัญชีเดิมบนเครื่องนี้ โปรดปิดแท็บโปรแกรมอื่นก่อนอัปเดต','Back up projects, photos and report data before updating to the latest release. Data stays in the local workspace for this account. Close other app tabs before updating.')}</p>
 {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
 {backed&&<p className="text-sm text-emerald-700">{tr('สร้างไฟล์สำรองแล้ว กรุณาตรวจสอบไฟล์ก่อนกดเปลี่ยนเวอร์ชัน','Backup generated. Confirm it was saved before switching.')}</p>}
 <div className="flex flex-wrap gap-2 justify-end"><button type="button" disabled={busy} className="border rounded-lg px-3 py-2 text-sm" onClick={()=>setOpen(false)}>{tr('อัปเดตภายหลัง','Later')}</button><button type="button" disabled={busy||!newer} onClick={backup} className="bg-blue-100 text-blue-800 rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-50">{busy?tr('กำลังสำรอง…','Backing up…'):tr('สำรองข้อมูล','Back up')}</button><button type="button" disabled={busy||!backed||!newer} onClick={switchVersion} className="bg-blue-700 text-white rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-50">{tr('อัปเดตเป็นเวอร์ชันล่าสุด','Update to latest')}</button></div>
 </div></div>}
 </>;
}
