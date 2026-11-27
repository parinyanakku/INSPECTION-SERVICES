import React, {useState} from 'react';
import {Download, Globe, Loader2} from 'lucide-react';
import type {AppLanguage, BrandConfig, ProjectFile, DefectItem} from '../types/inspection';
import {translateDefectStatus,translateSeverity} from '../i18n/translations';
import {renderFloorplanZonesToPng} from '../utils/imageUtils';

const esc=(v:unknown)=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const raster=(v:string|null|undefined)=>typeof v==='string'&&/^data:image\/(?:png|jpeg|jpg|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(v);
async function photoCopy(src:string|null|undefined):Promise<string>{
  if(!src)return '';
  if(!raster(src))throw Error('Unsupported embedded photo format');
  const im=new Image();
  await new Promise<void>((resolve,reject)=>{im.onload=()=>resolve();im.onerror=()=>reject(Error('Cannot decode photo'));im.src=src;});
  const scale=Math.min(1,1600/Math.max(im.naturalWidth,im.naturalHeight));
  const c=document.createElement('canvas');c.width=Math.max(1,Math.round(im.naturalWidth*scale));c.height=Math.max(1,Math.round(im.naturalHeight*scale));
  try{const ctx=c.getContext('2d');if(!ctx)throw Error('Canvas unavailable');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(im,0,0,c.width,c.height);return c.toDataURL('image/jpeg',.88);}
  finally{c.width=0;c.height=0;im.src='';}
}
function photoSource(d:DefectItem,side:'before'|'after'){
  const old=d as DefectItem&{annotatedBeforeImg?:string;annotatedAfterImg?:string;annotatedImage?:string;originalImage?:string};
  return side==='before'?old.annotatedBeforeImg||old.annotatedImage||d.beforeImg||d.photoDataUrl||old.originalImage:old.annotatedAfterImg||d.afterImg;
}
async function buildClientWebsite(project:ProjectFile,brand:BrandConfig,lang:AppLanguage,onProgress:(n:number)=>void){
 const tr=(th:string,en:string)=>lang==='en'?en:th;
 const rows=[...project.defects].sort((a,b)=>a.number-b.number);
 const floors=new Map<string,{name:string;index:number;src:string}>();
 for(const fl of project.floors){
   if(!rows.some(d=>d.floorId===fl.id))continue;
   const src=await renderFloorplanZonesToPng(fl);
   floors.set(fl.id,{name:fl.name,index:floors.size,src:raster(src)?src! : ''});
 }
 const cards:string[]=[];
 const zones=new Set<string>();
 const missing:string[]=[];
 for(let i=0;i<rows.length;i++){
   const d=rows[i],fl=floors.get(d.floorId),zone=d.zone||tr('ไม่ระบุโซน','Unspecified zone');zones.add(zone);
   let before='',after='';
   try{before=await photoCopy(photoSource(d,'before'));}catch{missing.push('#'+d.number+' Before');}
   try{after=await photoCopy(photoSource(d,'after'));}catch{missing.push('#'+d.number+' After');}
   const status=d.status==='แก้ไขแล้ว'?'fixed':d.status==='กำลังแก้ไข'?'partial':'pending';
   const sev=d.severity==='เร่งด่วน'?'urgent':d.severity==='ปานกลาง'?'moderate':'minor';
   const x=Number.isFinite(d.x)?Math.max(3,Math.min(97,d.x)):50,y=Number.isFinite(d.y)?Math.max(4,Math.min(96,d.y)):50;
   const photo=(src:string,label:string)=>'<figure><figcaption>'+esc(label)+'</figcaption>'+(src?'<button class="photo" type="button" aria-label="'+esc(label)+'"><img loading="lazy" alt="'+esc(label)+'" src="'+src+'"></button>':'<div class="empty">'+esc(tr('ไม่มีรูปที่แสดงได้','No available photo'))+'</div>')+'</figure>';
   cards.push('<article data-floor="'+esc(fl?.index??-1)+'" data-zone="'+esc(zone)+'" data-status="'+status+'" data-sev="'+sev+'"><div class="meta"><b>#'+esc(d.number)+'</b><span class="pill '+sev+'">'+esc(translateSeverity(d.severity,lang))+'</span><span class="pill '+status+'">'+esc(translateDefectStatus(d.status,lang))+'</span></div><h2>'+esc(d.title)+'</h2><p class="muted">'+esc(fl?.name||'')+' · '+esc(zone)+'</p><div class="media"><figure><figcaption>'+tr('ตำแหน่งหมุด','Pin location')+'</figcaption>'+(fl?.src&&Number.isFinite(d.x)&&Number.isFinite(d.y)?'<div class="plan floor-'+fl.index+'"><span class="pin '+sev+'" style="left:'+x+'%;top:'+y+'%">'+esc(d.number)+'</span></div>':'<div class="empty">'+tr('ไม่มีแปลน','No plan')+'</div>')+'</figure>'+photo(before,tr('ก่อนแก้ไข','Before'))+photo(after,tr('หลังแก้ไข','After'))+'</div>'+(!d.hideCause&&d.cause?'<p><strong>'+tr('สาเหตุทางวิศวกรรม: ','Cause: ')+'</strong>'+esc(d.cause)+'</p>':'')+(!d.hideSolution&&d.solution?'<p class="solution"><strong>'+tr('วิธีแก้ไข: ','Solution: ')+'</strong>'+esc(d.solution)+'</p>':'')+'</article>');
   onProgress(i+1);if(i%3===0)await new Promise<void>(resolve=>setTimeout(resolve,0));
 }
 const option=(value:unknown,label:unknown)=>'<option value="'+esc(value)+'">'+esc(label)+'</option>';
 const floorOptions=[...floors.values()].map(f=>option(f.index,f.name)).join('');
 const zoneOptions=[...zones].map(z=>option(z,z)).join('');
 const planStyles=[...floors.values()].filter(f=>f.src).map(f=>'.floor-'+f.index+'{background-image:url("'+f.src+'")}').join('\n');
 const fixed=rows.filter(d=>d.status==='แก้ไขแล้ว').length;
 const partial=rows.filter(d=>d.status==='กำลังแก้ไข').length;
 const html='<!doctype html><html lang="'+lang+'"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; style-src \'unsafe-inline\'; script-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'; connect-src \'none\'"><title>'+esc(project.name)+' · Defect</title><style>'+ `
 *{box-sizing:border-box}body{margin:0;background:#f1f5f9;color:#172033;font:15px/1.6 system-ui,Tahoma,sans-serif}main{max-width:1280px;margin:auto;padding:18px}header,article,.filters{background:#fff;border:1px solid #dbe3ed;border-radius:15px;padding:18px}header{border-top:5px solid #dc2626;margin-bottom:14px}h1{font-size:clamp(20px,3vw,28px);line-height:1.4;margin:5px 0}h2{font-size:17px;line-height:1.45;margin:7px 0 0}p{margin:8px 0;white-space:pre-line;overflow-wrap:anywhere}.muted,small{color:#64748b}.brand{color:#b91c1c;font-weight:700}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:12px}.stats div{background:#f8fafc;border:1px solid #dbe3ed;padding:8px;text-align:center;border-radius:9px;font-size:12px}.stats b{display:block;font-size:24px;color:#172033}.filters{display:flex;flex-wrap:wrap;gap:8px;position:sticky;top:0;z-index:2;box-shadow:0 3px 10px #0001;margin-bottom:14px}.filters input,.filters select,button{font:inherit}.filters input,.filters select{min-width:0;border:1px solid #cbd5e1;border-radius:8px;padding:8px;background:white;color:#172033}.filters input{flex:1 1 210px}.filters select{flex:1 1 125px}#count{width:100%;color:#475569;font-size:13px}#cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}article{min-width:0;content-visibility:auto;contain-intrinsic-size:430px}article[hidden]{display:none}.meta{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.pill{padding:2px 8px;border:1px solid #cbd5e1;border-radius:12px;font-size:12px}.urgent{color:#be123c}.moderate,.partial{color:#92400e}.minor{color:#1d4ed8}.fixed{color:#047857}.pending{color:#be123c}.media{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:12px 0}figure{margin:0;min-width:0}figcaption{font-size:12px;font-weight:700;margin-bottom:4px}.photo,.plan,.empty{width:100%;aspect-ratio:4/3;border:1px solid #dbe3ed;border-radius:7px;background:#f8fafc;overflow:hidden}.photo{padding:0;cursor:zoom-in}.photo img{width:100%;height:100%;object-fit:contain;display:block}.plan{position:relative;background-size:100% 100%;background-repeat:no-repeat}.pin{position:absolute;transform:translate(-50%,-50%);min-width:18px;height:18px;padding:0 3px;display:grid;place-items:center;border-radius:20px;background:#2563eb;color:white;font-size:10px;font-weight:bold;border:1px solid white}.pin.urgent{background:#dc2626}.pin.moderate{background:#d97706}.empty{display:grid;place-items:center;font-size:12px;text-align:center;color:#64748b;padding:4px}.solution{background:#ecfdf5;border:1px solid #bbf7d0;color:#065f46;padding:10px;border-radius:8px}dialog{border:0;border-radius:10px;background:#111827;color:white;width:min(96vw,1000px);max-height:95vh;padding:12px}dialog::backdrop{background:#000b}dialog img{display:block;max-width:100%;max-height:80vh;object-fit:contain;margin:auto}dialog button{display:block;margin:0 0 8px auto;padding:4px 15px;cursor:pointer}footer{text-align:center;padding:20px;color:#64748b}#top{position:fixed;bottom:16px;right:16px;background:#172033;color:white;border:0;border-radius:24px;padding:8px 14px;cursor:pointer} @media(max-width:720px){main{padding:10px}#cards{grid-template-columns:1fr}.stats{grid-template-columns:repeat(2,1fr)}header,article{padding:12px}.filters{padding:8px}.media{gap:5px}} `+planStyles+'</style></head><body><main><header><div class="brand">'+esc(brand.companyName)+'</div><h1>'+esc(project.name)+'</h1><p class="muted">'+esc(tr('รายการตรวจสอบสำหรับลูกค้า','Customer defect list'))+' · '+esc(project.inspectionDate)+'</p><small>'+esc(tr('ข้อมูล ณ เวลาส่งออก · สำหรับดูเท่านั้น ไม่เชื่อมข้อมูลสด','Exported snapshot · read-only, not live'))+'</small><div class="stats">'+[[rows.length,tr('ทั้งหมด','Total')],[fixed,tr('แก้ไขแล้ว','Fixed')],[partial,tr('แก้แล้วแต่ยังไม่เรียบร้อย','Incomplete')],[rows.length-fixed-partial,tr('รอแก้ไข','Pending')]].map(([n,label])=>'<div><b>'+n+'</b>'+esc(label)+'</div>').join('')+'</div></header><div class="filters"><input id="q" type="search" aria-label="'+tr('ค้นหา','Search')+'" placeholder="'+tr('ค้นหาเลขข้อหรือข้อความ','Search number or text')+'"><select id="floor" aria-label="'+tr('ชั้น','Floor')+'">'+option('',tr('ทุกชั้น','All floors'))+floorOptions+'</select><select id="zone" aria-label="'+tr('โซน','Zone')+'">'+option('',tr('ทุกโซน','All zones'))+zoneOptions+'</select><select id="status" aria-label="'+tr('สถานะ','Status')+'">'+option('',tr('ทุกสถานะ','All statuses'))+option('fixed',tr('แก้ไขแล้ว','Fixed'))+option('partial',tr('แก้แล้วแต่ยังไม่เรียบร้อย','Incomplete'))+option('pending',tr('รอแก้ไข','Pending'))+'</select><select id="sev" aria-label="'+tr('ความรุนแรง','Severity')+'">'+option('',tr('ทุกความรุนแรง','All severities'))+option('urgent',tr('เร่งด่วน','Urgent'))+option('moderate',tr('ปานกลาง','Moderate'))+option('minor',tr('เล็กน้อย','Minor'))+'</select><div id="count"></div></div><section id="cards">'+cards.join('')+'</section><footer>'+esc(brand.companyName)+'</footer></main><button id="top" type="button">↑ '+tr('บนสุด','Top')+'</button><dialog id="viewer"><button id="close" type="button">× '+tr('ปิด','Close')+'</button><img id="large" alt=""></dialog><script>'+ `
 const ids=['floor','zone','status','sev'];const q=document.getElementById('q'),cards=[...document.querySelectorAll('article')];function filter(){const term=q.value.trim().toLowerCase();let count=0;for(const el of cards){el.hidden=!(el.textContent.toLowerCase().includes(term)&&ids.every(id=>!document.getElementById(id).value||document.getElementById(id).value===el.dataset[id]));if(!el.hidden)count++}document.getElementById('count').textContent=count+' / '+cards.length}q.addEventListener('input',filter);ids.forEach(id=>document.getElementById(id).addEventListener('change',filter));filter();const viewer=document.getElementById('viewer'),large=document.getElementById('large');document.getElementById('cards').addEventListener('click',e=>{const b=e.target.closest('.photo');if(b){large.src=b.querySelector('img').src;viewer.showModal()}});document.getElementById('close').onclick=()=>viewer.close();viewer.addEventListener('close',()=>large.removeAttribute('src'));document.getElementById('top').onclick=()=>window.scrollTo({top:0,behavior:'smooth'});`+'</script></body></html>';
 return {html,missing};
}

export function ClientWebsiteTab({project,brand,lang}:{project:ProjectFile;brand:BrandConfig;lang:AppLanguage}){
 const [busy,setBusy]=useState(false),[done,setDone]=useState(0),[message,setMessage]=useState('');
 const tr=(th:string,en:string)=>lang==='en'?en:th;
 async function download(){
   if(busy)return;setBusy(true);setDone(0);setMessage('');
   try{const {html,missing}=await buildClientWebsite(project,brand,lang,setDone);const blob=new Blob([html],{type:'text/html;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='Client_Defects_'+(project.houseNo||'Report').replace(/[^a-zA-Z0-9ก-๙_-]/g,'_')+'.html';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);setMessage(missing.length?tr('สร้างไฟล์แล้ว แต่มีภาพอ่านไม่ได้: ','File created; unavailable photos: ')+missing.join(', '):tr('สร้างไฟล์เว็บไซต์แล้ว','Website file created'));}
   catch(e){setMessage(tr('สร้างไฟล์ไม่สำเร็จ: ','Export failed: ')+(e instanceof Error?e.message:String(e)));}
   finally{setBusy(false);}
 }
 return <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
   <h3 className="flex items-center gap-2 text-lg font-bold text-slate-900"><Globe className="w-5 h-5"/>{tr('ส่งออกเว็บไซต์สำหรับลูกค้า','Customer defect website')}</h3>
   <p className="text-sm text-slate-600">{tr('ส่งเฉพาะรายการ Defect ของโครงการนี้ พร้อมแปลนตำแหน่งหมุด ภาพก่อน–หลัง สาเหตุ วิธีแก้ไข สถานะ และตัวกรอง ใช้ดูบนคอมพิวเตอร์และมือถือ','Export this project’s defect list with pin locations, photos, details, statuses and filters for desktop and mobile.')}</p>
   <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">{tr('ไฟล์ HTML เปิดในเบราว์เซอร์ได้โดยไม่ใช้อินเทอร์เน็ต เป็นข้อมูล ณ เวลาส่งออก ไม่ใช่ลิงก์ออนไลน์หรือระบบอัปเดตสด ผู้ได้รับไฟล์สามารถส่งต่อและดูรูปได้ กรุณาส่งเฉพาะลูกค้าที่ได้รับอนุญาต','Offline HTML snapshot, not a hosted link or live synchronization. Anyone with the file can view and forward it; share only with authorized recipients.')}</div>
   <button type="button" onClick={download} disabled={busy} className="inline-flex items-center gap-2 rounded-xl brand-bg px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy?<Loader2 className="w-4 h-4 animate-spin"/>:<Download className="w-4 h-4"/>}{busy?tr('กำลังสร้างเว็บไซต์ ','Generating website ')+done+'/'+project.defects.length:tr('ดาวน์โหลดเว็บไซต์ (.html)','Download website (.html)')}</button>
   {message&&<p role="status" className="text-sm text-slate-700 break-words">{message}</p>}
 </section>;
}
