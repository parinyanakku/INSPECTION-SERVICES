import React,{useEffect,useRef,useState} from 'react';
import type {AppLanguage} from '../types/inspection';
import type {Format} from '../utils/reportStudioNative';
export function StudioFilePreview({blob,format,lang}:{blob:Blob;format:Format;lang:AppLanguage}){
 const en=lang==='en',tr=(a:string,b:string)=>en?b:a;
 const canvas=useRef<HTMLCanvasElement>(null),frame=useRef<HTMLIFrameElement>(null);
 const [page,setPage]=useState(1),[count,setCount]=useState(1),[error,setError]=useState(false),[loading,setLoading]=useState(true);
 const [sheets,setSheets]=useState<{name:string;rows:string[][]}[]>([]);
 const [sheet,setSheet]=useState(0);
 useEffect(()=>{setPage(1);setSheet(0);setSheets([]);setError(false);},[blob,format]);
 useEffect(()=>{
  if(format!=='pdf')return;let dead=false;let task:any,render:any;setLoading(true);setError(false);
  (async()=>{const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');const worker=await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url');pdfjs.GlobalWorkerOptions.workerSrc=worker.default;
   if(dead)return;task=pdfjs.getDocument({data:new Uint8Array(await blob.arrayBuffer()),isEvalSupported:false,enableXfa:false});const doc=await task.promise;if(dead)return;setCount(doc.numPages);const p=await doc.getPage(Math.min(page,doc.numPages));const viewport=p.getViewport({scale:1.6});const c=canvas.current;if(!c||dead)return;c.width=Math.ceil(viewport.width);c.height=Math.ceil(viewport.height);render=p.render({canvas:c,canvasContext:c.getContext('2d')!,viewport});await render.promise;if(!dead)setLoading(false);
  })().catch(()=>{if(!dead){setError(true);setLoading(false);}});
  return ()=>{dead=true;try{render?.cancel();void task?.destroy();}catch{}};
 },[blob,format,page]);
 useEffect(()=>{
  if(format==='pdf')return;let dead=false;setLoading(true);setError(false);
  (async()=>{
   if(format==='docx'){
    const node=frame.current,doc=node?.contentDocument;if(!doc)throw Error('PREVIEW_UNAVAILABLE');
    // The sandbox has no script permission; CSP blocks remote document assets.
    doc.open();doc.write('<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data: blob:; font-src data: blob:; style-src \'unsafe-inline\';"><style>body{margin:0;background:#e2e8f0}a{pointer-events:none}</style><div id="doc"></div>');doc.close();
    const {renderAsync}=await import('docx-preview');if(dead)return;
    await renderAsync(blob,doc.getElementById('doc')!,doc.head,{breakPages:true,inWrapper:true,ignoreLastRenderedPageBreak:false,renderAltChunks:false,useBase64URL:true});
    if(dead)return;doc.querySelectorAll('a').forEach(a=>a.removeAttribute('href'));
   }else{
    const XLSX=await import('xlsx');const book=XLSX.read(await blob.arrayBuffer(),{type:'array',sheetRows:201,cellHTML:false,cellFormula:false});
    if(dead)return;setSheets(book.SheetNames.slice(0,120).map(name=>{const ws=book.Sheets[name];const range=ws['!ref']?XLSX.utils.decode_range(ws['!ref']):{s:{r:0,c:0},e:{r:0,c:0}};range.e.r=Math.min(range.e.r,range.s.r+199);range.e.c=Math.min(range.e.c,range.s.c+29);return {name,rows:XLSX.utils.sheet_to_json<string[]>(ws,{header:1,range,raw:false,defval:''}).map(row=>row.map(x=>String(x??'')))};}));
   }
   if(!dead)setLoading(false);
  })().catch(()=>{if(!dead){setError(true);setLoading(false);}});
  return ()=>{dead=true;};
 },[blob,format]);
 return <div className="rounded-xl border border-slate-300 bg-slate-100 p-2 space-y-2">
  {loading&&<p role="status" className="text-sm">{tr('กำลังแสดงไฟล์ที่สร้างจริง…','Rendering generated file…')}</p>}
  {error&&<p role="alert" className="text-sm text-rose-700">{tr('แสดงตัวอย่างไม่ได้ โปรดเปิดไฟล์ที่ดาวน์โหลดในโปรแกรมที่รองรับก่อนนำส่ง','Preview failed. Open the downloaded file in a compatible app before delivery.')}</p>}
  {format==='pdf'&&<><div className="flex items-center justify-between gap-2 text-xs"><button type="button" className="border rounded px-3 py-2" disabled={page<=1||loading} onClick={()=>setPage(x=>x-1)}>◀</button><span>{tr('หน้า','Page')} {page}/{count}</span><button type="button" className="border rounded px-3 py-2" disabled={page>=count||loading} onClick={()=>setPage(x=>x+1)}>▶</button></div><canvas ref={canvas} className="block max-w-full h-auto mx-auto bg-white" aria-label={tr('พรีวิว PDF ฉบับจริง','Actual PDF preview')}/></>}
  {format==='docx'&&<><p className="text-xs">{tr('ตัวอย่าง Word จากไฟล์จริง การแบ่งหน้าและฟอนต์อาจต่างจาก Microsoft Word','Actual DOCX browser preview; pagination and fonts may differ from Microsoft Word.')}</p><iframe ref={frame} sandbox="allow-same-origin" title={tr('พรีวิว Word','Word preview')} className="w-full bg-white border rounded" style={{height:620}}/></>}
  {format==='xlsx'&&<><p className="text-xs">{tr('ตัวอย่างค่าในเซลล์จากไฟล์จริง แสดงสูงสุด 200 แถว × 30 คอลัมน์ต่อชีต ไม่ใช่ตัวอย่างก่อนพิมพ์หรือรูปภาพฝัง','Actual cell values, up to 200 rows × 30 columns per sheet. Not a print or embedded-image preview.')}</p><select value={sheet} onChange={e=>setSheet(+e.target.value)} className="w-full border p-2 rounded">{sheets.map((s,i)=><option key={s.name} value={i}>{s.name}</option>)}</select><div className="max-h-[520px] overflow-auto bg-white"><table className="border-collapse text-xs"><tbody>{sheets[sheet]?.rows.map((r,i)=><tr key={i}><th className="border p-1 bg-slate-100">{i+1}</th>{r.map((c,j)=><td key={j} className="border border-slate-300 p-1 min-w-20 whitespace-pre-wrap">{c}</td>)}</tr>)}</tbody></table></div></>}
 </div>;
}
