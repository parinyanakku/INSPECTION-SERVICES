import React, { useEffect, useRef, useState } from 'react';
import type { AppLanguage } from '../types/inspection';

type Release = {version:string; date:string; notes:string; notesTh?:string; notesEn?:string; build:number; storageSchema?:number};
type Manifest = {latest:string; releases:Release[]};
const PIN = 'tis_preferred_release_v1';
const VERSION = /^v1\.0\.\d+$/;
const route = window.location.pathname.match(/^(.*\/)(?:versions)\/(v1\.0\.\d+)(?:\/|$)/);
const current = route?.[2] || '';
const root = route?.[1] || '';
type Highlight = {from:number;to:number;th:string[];en:string[]};
const HIGHLIGHTS:Highlight[]=[
 {from:153,to:153,th:['ปรับหน้าโหมดผู้ซื้อให้เหลือระบบแนะนำการใช้งานแบบทำตามทีละขั้นตอน โดยนำปุ่มวิดีโอออก'],en:['Keep the interactive buyer guide and remove the video lesson entry.']},
 {from:150,to:152,th:['ตั้งข้อความรองของบริษัทในโหมดผู้ซื้อเป็น “ยังไม่ระบุ” จนกว่าจะกรอกเอง'],en:['Leave the buyer company subtitle unset until customized.']},
 {from:145,to:149,th:['ซ่อนหน้าต่าง Google Drive ขณะส่งไฟล์และทำงานอื่นต่อได้ พร้อมแถบความคืบหน้าและปุ่มยกเลิก'],en:['Minimize Google Drive during transfer, continue working, and view progress or cancel.']},
 {from:139,to:144,th:['เพิ่มบทแนะนำผู้ซื้อ 12 ขั้นตอน พร้อมไฮไลต์ปุ่มจริง ย้อนกลับ ข้าม และเริ่มใหม่ได้'],en:['Add a 12-step buyer guide with real-control highlights, back, skip and restart.']},
 {from:132,to:138,th:['สร้างลิงก์เว็บไซต์รายงานสำหรับลูกค้า แชร์ผ่าน LINE ได้','กำหนดอายุลิงก์ ยกเลิกได้ และย่อลิงก์เดิมโดยไม่ต้องส่งภาพใหม่'],en:['Create customer report links and share via LINE.','Set expiry, revoke links, and shorten existing links without uploading images again.']},
 {from:124,to:131,th:['เพิ่มปุ่มยกเลิกการสร้างรายงาน PDF / Word / Excel','เริ่มต้นชื่อผู้ตรวจสอบและใบอนุญาตในโหมดผู้ซื้อเป็น “ยังไม่ระบุ”'],en:['Cancel PDF, Word and Excel report generation.','Leave buyer inspector and license details unset by default.']},
 {from:119,to:123,th:['ดาวน์โหลดรายงาน PDF / Word / Excel ทั้ง 3 ไฟล์ด้วยปุ่มเดียว','ตั้งชื่อไฟล์ตามเจ้าของบ้านและวันที่ตรวจจริง','ปรับการขยายแปลนและรูปในเว็บไซต์ลูกค้า'],en:['Download all three report formats with one button.','Name downloads by owner and inspection date.','Improve plan and photo viewing in the customer website.']},
 {from:105,to:118,th:['เลือกรายงานตรวจครั้งแรกหรือรายงานตรวจติดตาม','รองรับชื่อเจ้าของบ้านหลายคนและปรับชื่อโครงการบนหน้าปก','ปรับตารางและช่องสถานะการแก้ไขให้อ่านง่าย'],en:['Choose initial or follow-up report layout.','Support multiple owners and improve project cover titles.','Improve report tables and repair status labels.']},
 {from:95,to:100,th:['เพิ่มโทนสีหน้าโปรแกรม 5 แบบ พร้อมปรับความชัดเจนโหมดมืด','เพิ่มปุ่มเลื่อนขึ้นบนสุดและลงล่างสุด','ปรับการสร้างรายงานโครงการขนาดใหญ่ให้ใช้หน่วยความจำน้อยลง'],en:['Add five page themes and improve dark-mode contrast.','Add scroll-to-top and bottom buttons.','Reduce memory use when generating large reports.']},
 {from:88,to:94,th:['ขยายภาพได้ถึง 600% พร้อมเลื่อน ครอป และแทรกรูปซ้อน','ปรับเครื่องมือแก้ไขภาพและหน้ารายละเอียด Defect','วิเคราะห์รูปเดิมด้วย AI ซ้ำได้ก่อนยืนยันผล'],en:['Zoom photos up to 600%, pan, crop and insert inset photos.','Improve annotation tools and defect details.','Review AI re-analysis of existing photos.']},
 {from:82,to:87,th:['เลือกโซนก่อนปักหมุดและเลื่อน/ขยายแปลนไปยังโซนที่เลือก','จัดลำดับหมายเลข Defect ตามชั้นและโซน','แก้ไขโซนที่ซ้อนกันได้สะดวกขึ้น'],en:['Select a zone before placing pins and focus the plan on it.','Group defect numbering by floor and zone.','Improve editing of overlapping zones.']},
 {from:70,to:81,th:['เพิ่มย้อนกลับ/ทำซ้ำในเครื่องมือแปลนและตำแหน่งหมุด','เพิ่มแก้ไขข้อความเดิม ย้าย ย่อขยาย และวาดเส้นตรงบนภาพ','จัดกลุ่มเครื่องมือและเพิ่มเมนูคลิกขวา/แตะค้าง'],en:['Undo/redo plan edits and pin positions.','Edit, move and resize existing text, and draw straight lines.','Organize tools and add context menus for mouse and touch.']},
 {from:55,to:68,th:['ปรับเล่มรายงานเป็น A4 แนวนอนสำหรับตาราง Defect พร้อมหมุดเฉพาะข้อและรูปก่อน–หลัง','ปรับฟอนต์ไทย ช่องสถานะ และจัดประมาณ 3 ข้อต่อหน้า','แสดงความคืบหน้าและยกเลิกการสร้าง PDF ได้'],en:['Improve landscape A4 defect tables with individual pins and before/after photos.','Improve Thai text, status fields and three-record pagination.','Show PDF progress and allow cancellation.']},
 {from:48,to:54,th:['เปลี่ยนชื่อชั้นได้ และปรับขนาดโซนละเอียดขึ้น','เพิ่มหมุนรูป 90 องศาและรองรับภาพ DNG RAW','ปรับเครื่องมือวาดแปลนและทดลองแปลงภาพร่างด้วย AI','เพิ่มสวิตช์ซิงค์ Google Drive อัตโนมัติ'],en:['Rename floors and fine-tune zone sizes.','Rotate photos by 90 degrees and import DNG RAW images.','Improve floor plan drawing and AI sketch preview.','Add automatic Google Drive sync.']},
 {from:38,to:47,th:['รองรับภาษาไทย/อังกฤษตั้งแต่หน้าเข้าสู่ระบบ','เพิ่ม Google Drive Sync รับข้อมูลข้ามเครื่องและส่งสำเนาไฟล์พร้อมรูป','ปรับหน้ารายงานบนมือถือให้ใช้รูปแบบ A4 เหมือนคอมพิวเตอร์'],en:['Support Thai/English from login onward.','Add Google Drive synchronization and visible file copies with photos.','Unify mobile and desktop A4 report layouts.']},
 {from:27,to:37,th:['เลือกภาพหน้าปกรายงานและเงื่อนไขการตรวจ','ส่งออก Word ที่แก้ไขได้ และ Excel จัดหน้ากระดาษ A4 พร้อมรูป','ปรับแปลน ฟอนต์ และการจัดหน้าเล่มรายงาน'],en:['Choose cover photos and inspection conditions.','Export editable Word and formatted A4 Excel reports with images.','Improve plan controls, fonts and report pagination.']},
 {from:9,to:26,th:['เพิ่มระบบบัญชีผู้ซื้อและสิทธิ์ License แยกพื้นที่งานแต่ละบัญชี','เปลี่ยนรหัสผ่านและกู้คืนบัญชี','เลือกอัปเดตเวอร์ชันได้โดยไม่ต้องนำเข้าข้อมูลซ้ำ และกลับหน้าโครงการเดิมหลังรีเฟรช'],en:['Add licensed buyer accounts with separate workspaces.','Support password change and account recovery.','Offer optional updates and restore the previous project view.']},
];
const buildOf=(v:string)=>Number(v.split('.').pop());
function highlightsFor(releases:Release[],en:boolean){
 const sorted=[...releases].sort((a,b)=>buildOf(b.version)-buildOf(a.version));
 const groups:{version:string;date:string;items:string[]}[]=[];
 const seen=new Set<string>();
 for(const r of sorted){
   const n=buildOf(r.version),h=HIGHLIGHTS.find(x=>n>=x.from&&n<=x.to);
   if(h){
     const key=h.from+':'+h.to;if(seen.has(key))continue;seen.add(key);
     const members=sorted.filter(x=>buildOf(x.version)>=h.from&&buildOf(x.version)<=h.to);
     const first=members[members.length-1].version.toUpperCase(),last=members[0].version.toUpperCase();
     groups.push({version:first===last?last:first+' – '+last,date:r.date.slice(0,10),items:en?h.en:h.th});
   }else{
     const items=/Add expandable user-facing release history/i.test(r.notes||'')?[en?'Expand previous updates and read major user-facing changes.':'เพิ่มประวัติการอัปเดตย้อนหลังแบบกดขยาย พร้อมสรุปเฉพาะหัวข้อสำคัญ']:en&&r.notesEn?[r.notesEn]:!en&&r.notesTh?[r.notesTh]:[];
     if(items.length){const key=items.join('|');if(seen.has(key))continue;seen.add(key);groups.push({version:r.version.toUpperCase(),date:r.date.slice(0,10),items});}
   }
 }
 return groups;
}

export function VersionUpdate({lang,onBackup,onPrepare}:{lang:AppLanguage;onBackup:()=>Promise<boolean>;onPrepare:()=>Promise<boolean>}) {
 const en=lang==='en', tr=(th:string,eng:string)=>en?eng:th;
 const [manifest,setManifest]=useState<Manifest|null>(null);
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false);
 const [operation,setOperation]=useState<'backup'|'update'|null>(null);
 const cancelNavigation=useRef(false);
 const closeDialog=()=>{cancelNavigation.current=true;setOpen(false);};
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
 useEffect(()=>{if(!open)return;const key=(e:KeyboardEvent)=>{if(e.key==='Escape')closeDialog();};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[open,busy]);
 if(!current)return null;
 const target=manifest?.releases.find(r=>r.version===manifest.latest&&r.storageSchema===2);
 const newer=!!target&&Number(target.version.split('.').pop())>Number(current.split('.').pop());
 const backed=!!target&&backedVersion===target.version;
 async function backup(){
   if(busy||!target||!newer)return;
   const backupFor=target.version;
   setOperation('backup');setBusy(true);setError('');setBackedVersion('');
   try{if(await onBackup())setBackedVersion(backupFor);else setError(tr('ยังไม่ได้สำรองข้อมูล กรุณาลองอีกครั้ง','Backup was not completed. Try again.'));}
   catch{setError(tr('สำรองข้อมูลไม่สำเร็จ','Backup failed'));}
   finally{setBusy(false);setOperation(null);}
 }
 async function switchVersion(){
   if(busy||!target||!newer)return;
   if(!window.confirm(tr('อัปเดตเป็นเวอร์ชันล่าสุดหรือไม่? ระบบจะบันทึกงานลงเครื่องก่อนเปิดเวอร์ชันใหม่ โปรดบันทึกงานร่างและปิดแท็บอื่นก่อน','Update now? Save drafts and close other tabs. The local workspace will be saved before opening the new version.')))return;
   cancelNavigation.current=false;setOperation('update');setBusy(true);setError('');
   try{
     if(!await onPrepare())throw Error('Local save failed');
     if(cancelNavigation.current){setBusy(false);setOperation(null);return;}
     localStorage.setItem(PIN,target.version);
     window.location.assign(root+'versions/'+target.version+'/');
   }catch{setError(tr('ยังอัปเดตไม่ได้ กรุณาตรวจสอบการบันทึกข้อมูลหรือสำรอง JSON ก่อนลองใหม่','Cannot update. Check local saving or export a JSON backup before retrying.'));setBusy(false);setOperation(null);}
 }
 return <>
 <button type="button" onClick={()=>{setOpen(true);setBackedVersion('');void load();}} className={'px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 '+(newer?'bg-orange-50 border-orange-200 text-orange-700':'bg-slate-50 border-slate-200 text-slate-700')}>
  {current.toUpperCase()} · {tr('อัปเดตเวอร์ชัน','Updates')}{newer&&<span className="w-2 h-2 bg-orange-500 rounded-full" aria-label={tr('มีเวอร์ชันใหม่','New version')}/>}
 </button>
 {open&&<div className="fixed inset-0 z-[100] bg-slate-900/50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={tr('อัปเดตเวอร์ชัน','Version updates')} onClick={e=>{if(e.target===e.currentTarget)closeDialog();}}>
 <div className="bg-white rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-xl max-h-[90vh] overflow-auto">
 <h2 className="text-lg font-bold">{tr('อัปเดตโปรแกรม','Program updates')}</h2>
 <p className="text-sm text-slate-600">{tr('เลือกใช้เวอร์ชันเดิมต่อได้ โปรแกรมจะไม่บังคับเปลี่ยนเวอร์ชัน','You can keep using your current version. Updates are optional.')}</p>
 <div className="grid grid-cols-2 gap-3"><div className="rounded-xl bg-slate-100 p-3"><p className="text-xs">{tr('ปัจจุบัน','Current')}</p><strong>{current.toUpperCase()}</strong></div><div className="rounded-xl bg-blue-50 p-3"><p className="text-xs">{tr('ล่าสุด','Latest')}</p><strong>{manifest?.latest.toUpperCase()||'—'}</strong></div></div>
 {manifest&&target&&!newer&&<p className="text-sm font-semibold text-emerald-700">{tr('ไม่มีเวอร์ชันใหม่ให้ดาวน์โหลด','No newer compatible release is available.')}</p>}
 {target&&(()=>{
   const groups=highlightsFor(manifest?.releases||[],en);
   const latestGroup=groups.find(g=>g.version.endsWith(target.version.toUpperCase()));
   const history=groups.filter(g=>g!==latestGroup);
   return <div className="rounded-xl bg-slate-50 p-3 text-sm space-y-3">
     <div><strong>{tr('รายละเอียดเวอร์ชันล่าสุด','Latest release highlights')}</strong><div className="mt-1 text-xs text-slate-500">{target.version.toUpperCase()} · {target.date.slice(0,10)}</div>
       {latestGroup?<ul className="mt-2 list-disc pl-5 space-y-1">{latestGroup.items.map((item,i)=><li key={i}>{item}</li>)}</ul>:<p className="mt-2 text-xs text-slate-600">{tr('ยังไม่มีสรุปการเปลี่ยนแปลงหน้าการใช้งานสำหรับรุ่นนี้','No user-facing summary has been published for this version.')}</p>}
     </div>
     <details className="border-t border-slate-200 pt-3">
       <summary className="cursor-pointer font-bold text-blue-800 select-none">{tr('ดูประวัติการอัปเดตย้อนหลัง','View update history')} ({history.length} {tr('ช่วงเวอร์ชัน','release groups')})</summary>
       <p className="text-xs text-slate-500 mt-2">{tr('รวมเฉพาะหัวข้อหลักที่มีผลต่อการใช้งาน จัดกลุ่มเวอร์ชันที่พัฒนาฟังก์ชันเดียวกัน','Major user-facing changes only. Related releases are grouped.')}</p>
       <div className="mt-3 space-y-2 max-h-[38vh] overflow-y-auto pr-1">
         {history.map(g=><article key={g.version} className="rounded-lg border border-slate-200 bg-white p-3"><div className="flex flex-wrap justify-between items-center gap-1"><strong className="text-xs text-slate-900">{g.version}</strong><span className="text-xs text-slate-500">{g.date}</span></div><ul className="mt-2 list-disc pl-5 space-y-1 text-xs text-slate-700">{g.items.map((item,i)=><li key={i}>{item}</li>)}</ul></article>)}
       </div>
     </details>
   </div>;
 })()}
 <p className="text-xs text-slate-600">{tr('เมื่ออัปเดต ระบบจะบันทึกงานลงเครื่องก่อนโดยอัตโนมัติ โครงการ รูปภาพ และรายงานจะอยู่ในบัญชีเดิมบนเบราว์เซอร์นี้ ไม่ต้องนำเข้าใหม่ สามารถดาวน์โหลดไฟล์สำรองเพิ่มเติมได้ตามต้องการ','Updates save the local workspace before switching. Projects, photos and reports remain in the same account on this browser. A downloadable backup is optional.')}</p>
 {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
 {busy&&<p className="text-xs text-slate-600">{tr('ปิดหน้าต่างได้ ระบบจะไม่เปลี่ยนเวอร์ชันหากปิดก่อนบันทึกเสร็จ ส่วนการสำรองที่เริ่มแล้วอาจดำเนินต่อ','You can close this dialog. Closing before saving finishes cancels navigation. A backup already started may continue.')}</p>}
 {backed&&<p className="text-sm text-emerald-700">{tr('สร้างไฟล์สำรองเพิ่มเติมแล้ว','Optional backup generated.')}</p>}
 <div className="flex flex-wrap gap-2 justify-end"><button type="button" className="border rounded-lg px-3 py-2 text-sm" onClick={closeDialog}>{tr('อัปเดตภายหลัง','Later')}</button><button type="button" disabled={busy||!newer} onClick={backup} className="bg-blue-100 text-blue-800 rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-50">{operation==='backup'?tr('กำลังสำรอง…','Backing up…'):tr('สำรองไฟล์เพิ่มเติม','Export backup')}</button><button type="button" disabled={busy||!newer} onClick={()=>void switchVersion()} className="bg-blue-700 text-white rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-50">{operation==='update'?tr('กำลังบันทึกก่อนอัปเดต…','Saving before update…'):tr('อัปเดตเป็นเวอร์ชันล่าสุด','Update to latest')}</button></div>
 </div></div>}
 </>;
}
