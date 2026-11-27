import React,{useEffect,useRef,useState} from 'react';
import type {AppLanguage,ProjectFile} from '../types/inspection';
import type {ImageRange} from '../utils/driveImageIndex.mjs';
export type DrivePreviewIndex={fileId:string;hash:string;date:string;projects:ProjectFile[];ranges:ImageRange[];total:number};
export function DriveReadOnlyPreview({index,lang,loadPhoto,onClose}:{index:DrivePreviewIndex;lang:AppLanguage;loadPhoto:(range:ImageRange,signal:AbortSignal)=>Promise<string>;onClose:()=>void}){
 const tr=(th:string,en:string)=>lang==='en'?en:th;
 const [project,setProject]=useState(0),[defect,setDefect]=useState(0),[photo,setPhoto]=useState(''),[message,setMessage]=useState('');
 const current=useRef<AbortController|null>(null);
 useEffect(()=>()=>current.current?.abort(),[]);
 function clear(){current.current?.abort();current.current=null;setPhoto('');setMessage('');}
 const p=index.projects[project],d=p?.defects[defect];
 async function show(value:unknown){
  clear();if(typeof value!=='string'||!/^tis-drive-image:\d+$/.test(value)){setMessage(tr('ไม่มีรูปต้นฉบับในช่องนี้','No original photo in this field'));return;}
  const range=index.ranges[Number(value.slice('tis-drive-image:'.length))];if(!range)return;
  const op=new AbortController();current.current=op;setMessage(tr('กำลังโหลดรูปต้นฉบับ…','Loading original photo…'));
  try{const src=await loadPhoto(range,op.signal);if(current.current===op&&!op.signal.aborted){setPhoto(src);setMessage('');}}
  catch(e){if(current.current===op&&!op.signal.aborted)setMessage(String(e));}
 }
 return <section className="rounded-xl border-2 border-indigo-400 bg-indigo-50 p-3 space-y-3 text-slate-900">
  <div className="flex justify-between gap-2"><strong>{tr('ดูงานจาก Drive · อ่านอย่างเดียว','Drive work viewer · Read only')}</strong><button type="button" onClick={()=>{clear();onClose();}} className="underline text-sm">{tr('ปิด','Close')}</button></div>
  <div className="text-xs">{index.projects.length} {tr('แฟ้ม','projects')} · {index.projects.reduce((n,p)=>n+p.defects.length,0)} Defect · {new Date(index.date).toLocaleString(lang==='en'?'en-GB':'th-TH')}</div>
  <p className="text-xs">{tr('ตรวจบัญชีและจำนวนรายการแล้ว ยังไม่ได้ตรวจ hash ทั้งไฟล์ ไม่ใช่การนำเข้าหรือซิงค์ ไม่แก้ไขข้อมูลในเครื่องหรือ Drive','Account and counts checked; full-file hash not verified. This is not import or sync and does not change local or Drive work.')}</p>
  <select aria-label={tr('เลือกแฟ้ม','Select project')} value={project} onChange={e=>{clear();setProject(Number(e.target.value));setDefect(0);}} className="w-full rounded border bg-white p-2">{index.projects.map((p,i)=><option key={i} value={i}>{p.name||p.id} · {p.defects.length} Defect</option>)}</select>
  {p&&<div className="space-y-2"><p className="text-sm">{p.houseNo} {p.clientName} · {p.inspectionDate}</p>
   {p.floors.map(f=><button key={f.id} type="button" onClick={()=>void show(f.imageUrl)} className="mr-1 mb-1 rounded border bg-white p-1 text-xs">{tr('แปลน','Plan')} {f.name}</button>)}
   {p.defects.length>0&&<select aria-label="Defect" value={defect} onChange={e=>{clear();setDefect(Number(e.target.value));}} className="w-full rounded border bg-white p-2">{p.defects.map((d,i)=><option key={i} value={i}>{d.number} · {d.title}</option>)}</select>}
   {d&&<div className="rounded border bg-white p-3 space-y-2 text-sm"><strong>{d.number}. {d.title}</strong><p>{d.zone} · {d.status} · {d.severity}</p><p className="whitespace-pre-wrap">{d.cause}</p><p className="whitespace-pre-wrap">{d.solution}</p><div className="flex flex-wrap gap-2"><button type="button" onClick={()=>void show(d.beforeImg||d.photoDataUrl)} className="rounded border p-2">{tr('รูปก่อนแก้ไข','Before photo')}</button><button type="button" onClick={()=>void show(d.afterImg)} className="rounded border p-2">{tr('รูปหลังแก้ไข','After photo')}</button></div></div>}
  </div>}
  {message&&<p role="status" className="text-xs break-words">{message}</p>}
  {photo&&<img src={photo} alt={tr('ภาพต้นฉบับ','Original photo')} className="w-full h-auto rounded border bg-white"/>}
 </section>;
}
