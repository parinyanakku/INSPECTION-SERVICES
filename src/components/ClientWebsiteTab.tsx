import React, {useState} from 'react';
import {Download, Globe, Loader2, Link2, Copy, Share2, Trash2} from 'lucide-react';
import {workspaceStorage} from '../utils/workspaceStorage';
import type {AppLanguage, BrandConfig, ProjectFile, DefectItem} from '../types/inspection';
import {translateDefectStatus,translateSeverity} from '../i18n/translations';
import {renderFloorplanZonesToPng,inspectionDownloadName} from '../utils/imageUtils';

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
   cards.push('<article data-floor="'+esc(fl?.index??-1)+'" data-zone="'+esc(zone)+'" data-status="'+status+'" data-sev="'+sev+'"><div class="meta"><b>#'+esc(d.number)+'</b><span class="pill '+sev+'">'+esc(translateSeverity(d.severity,lang))+'</span><span class="pill '+status+'">'+esc(translateDefectStatus(d.status,lang))+'</span></div><h2>'+esc(d.title)+'</h2><p class="muted">'+esc(fl?.name||'')+' · '+esc(zone)+'</p><div class="media"><figure><figcaption>'+tr('ตำแหน่งหมุด','Pin location')+'</figcaption>'+(fl?.src&&Number.isFinite(d.x)&&Number.isFinite(d.y)?'<button type="button" class="plan floor-'+fl.index+'" aria-label="'+esc(tr('ขยายตำแหน่งหมุด','Enlarge pin location')+' #'+d.number)+'"><span class="pin '+sev+'" style="left:'+x+'%;top:'+y+'%">'+esc(d.number)+'</span></button>':'<div class="empty">'+tr('ไม่มีแปลน','No plan')+'</div>')+'</figure>'+photo(before,tr('ก่อนแก้ไข','Before'))+photo(after,tr('หลังแก้ไข','After'))+'</div>'+(!d.hideCause&&d.cause?'<p><strong>'+tr('สาเหตุทางวิศวกรรม: ','Cause: ')+'</strong>'+esc(d.cause)+'</p>':'')+(!d.hideSolution&&d.solution?'<p class="solution"><strong>'+tr('วิธีแก้ไข: ','Solution: ')+'</strong>'+esc(d.solution)+'</p>':'')+'</article>');
   onProgress(i+1);if(i%3===0)await new Promise<void>(resolve=>setTimeout(resolve,0));
 }
 const option=(value:unknown,label:unknown)=>'<option value="'+esc(value)+'">'+esc(label)+'</option>';
 const floorOptions=[...floors.values()].map(f=>option(f.index,f.name)).join('');
 const zoneOptions=[...zones].map(z=>option(z,z)).join('');
 const planStyles=[...floors.values()].filter(f=>f.src).map(f=>'.floor-'+f.index+'{background-image:url("'+f.src+'")}').join('\n');
 const fixed=rows.filter(d=>d.status==='แก้ไขแล้ว').length;
 const partial=rows.filter(d=>d.status==='กำลังแก้ไข').length;
 const html='<!doctype html><html lang="'+lang+'"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; style-src \'unsafe-inline\'; script-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'; connect-src \'none\'"><title>'+esc(project.name)+' · Defect</title><style>'+ `
 *{box-sizing:border-box}body{margin:0;background:#f1f5f9;color:#172033;font:15px/1.6 system-ui,Tahoma,sans-serif}main{max-width:1280px;margin:auto;padding:18px}header,article,.filters{background:#fff;border:1px solid #dbe3ed;border-radius:15px;padding:18px}header{border-top:5px solid #dc2626;margin-bottom:14px}h1{font-size:clamp(20px,3vw,28px);line-height:1.4;margin:5px 0}h2{font-size:17px;line-height:1.45;margin:7px 0 0}p{margin:8px 0;white-space:pre-line;overflow-wrap:anywhere}.muted,small{color:#64748b}.brand{color:#b91c1c;font-weight:700}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:12px}.stats div{background:#f8fafc;border:1px solid #dbe3ed;padding:8px;text-align:center;border-radius:9px;font-size:12px}.stats b{display:block;font-size:24px;color:#172033}.filters{display:flex;flex-wrap:wrap;gap:8px;position:sticky;top:0;z-index:2;box-shadow:0 3px 10px #0001;margin-bottom:14px}.filters input,.filters select,button{font:inherit}.filters input,.filters select{min-width:0;border:1px solid #cbd5e1;border-radius:8px;padding:8px;background:white;color:#172033}.filters input{flex:1 1 210px}.filters select{flex:1 1 125px}#count{width:100%;color:#475569;font-size:13px}#cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}article{min-width:0;content-visibility:auto;contain-intrinsic-size:430px}article[hidden]{display:none}.meta{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.pill{padding:2px 8px;border:1px solid #cbd5e1;border-radius:12px;font-size:12px}.urgent{color:#be123c}.moderate,.partial{color:#92400e}.minor{color:#1d4ed8}.fixed{color:#047857}.pending{color:#be123c}.media{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:12px 0}figure{margin:0;min-width:0}figcaption{font-size:12px;font-weight:700;margin-bottom:4px}.photo,.plan,.empty{width:100%;aspect-ratio:4/3;border:1px solid #dbe3ed;border-radius:7px;background:#f8fafc;overflow:hidden}.photo{padding:0;cursor:zoom-in}.photo img{width:100%;height:100%;object-fit:contain;display:block}.plan{position:relative;background-size:100% 100%;background-repeat:no-repeat}.pin{position:absolute;transform:translate(-50%,-50%);min-width:18px;height:18px;padding:0 3px;display:grid;place-items:center;border-radius:20px;background:#2563eb;color:white;font-size:10px;font-weight:bold;border:1px solid white}.pin.urgent{background:#dc2626}.pin.moderate{background:#d97706}.empty{display:grid;place-items:center;font-size:12px;text-align:center;color:#64748b;padding:4px}.solution{background:#ecfdf5;border:1px solid #bbf7d0;color:#065f46;padding:10px;border-radius:8px}dialog{border:0;border-radius:10px;background:#111827;color:white;width:min(96vw,1000px);max-height:95vh;padding:12px}dialog::backdrop{background:#000b}dialog img{display:block;max-width:100%;max-height:80vh;object-fit:contain;margin:auto}dialog button{display:block;margin:0 0 8px auto;padding:4px 15px;cursor:pointer}footer{text-align:center;padding:20px;color:#64748b}#top{position:fixed;bottom:16px;right:16px;background:#172033;color:white;border:0;border-radius:24px;padding:8px 14px;cursor:pointer} @media(max-width:720px){main{padding:10px}#cards{grid-template-columns:1fr}.stats{grid-template-columns:repeat(2,1fr)}header,article{padding:12px}.filters{padding:8px}.media{gap:5px}}  
 :root{--bg:#f1f5f9;--card:#fff;--soft:#f8fafc;--ink:#172033;--muted:#475569;--line:#dbe3ed;--accent:#b91c1c;--solution:#ecfdf5;--solution-ink:#065f46;--solution-line:#bbf7d0;--red:#be123c;--orange:#92400e;--blue:#1d4ed8;--green:#047857}html[data-theme="navy"]{color-scheme:dark;--bg:#0f172a;--card:#1e293b;--soft:#28364b;--ink:#f1f5f9;--muted:#bdcbe0;--line:#475569;--accent:#fca5a5;--solution:#173e34;--solution-ink:#b6f4d5;--solution-line:#407864;--red:#fda4af;--orange:#fcd34d;--blue:#93c5fd;--green:#86efac}html[data-theme="warm"]{--bg:#f2eee6;--card:#fffdf8;--soft:#f7f1e7;--ink:#342c23;--muted:#665744;--line:#dcd1bf;--accent:#a3311f}
 body{background:var(--bg);color:var(--ink)}header,article,.filters{background:var(--card);border-color:var(--line)}.brand{color:var(--accent)}.muted,small,#count,footer,.empty{color:var(--muted)}.stats div,.photo,.plan,.empty{background-color:var(--soft);border-color:var(--line)}.stats b{color:var(--ink)}.filters input,.filters select,.theme-control select{background:var(--card);color:var(--ink);border:1px solid var(--line);border-radius:8px;padding:8px}.pill{border-color:var(--line)}.urgent,.pending{color:var(--red)}.moderate,.partial{color:var(--orange)}.minor{color:var(--blue)}.fixed{color:var(--green)}.solution{background:var(--solution);color:var(--solution-ink);border-color:var(--solution-line)}.header-row{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap}.heading{flex:1 1 300px;min-width:0}.theme-control{display:flex;align-items:center;gap:8px;white-space:nowrap;font-size:13px;font-weight:600}.plan{display:block;cursor:zoom-in;padding:0}.pin{color:white}.viewer-bar,.viewer-tools{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.viewer-bar{justify-content:space-between;padding-bottom:8px}.viewer-tools button{margin:0;border:1px solid #64748b;border-radius:6px;background:#334155;color:white;padding:5px 10px;min-height:34px}.viewer-tools span{font-size:12px}#viewer-scroll{max-height:77vh;overflow:auto;overscroll-behavior:contain;background:#1e293b;border-radius:8px}#viewer-content{width:100%;margin:auto;min-width:0}#large{width:100%;height:auto;max-height:none;max-width:none;object-fit:contain}#large-plan{width:100%;aspect-ratio:4/3;background-size:100% 100%;cursor:default}#large-plan .pin{font-size:16px;height:28px;min-width:28px}#large[hidden],#large-plan[hidden]{display:none}button:focus-visible,select:focus-visible{outline:3px solid #60a5fa;outline-offset:2px}@media(max-width:720px){.heading{flex-basis:100%}.theme-control{margin-left:auto}.filters{position:static}#viewer-scroll{max-height:70vh}.viewer-tools{gap:5px}}
 `+planStyles+'</style></head><body><main><header><div class="header-row"><div class="heading"><div class="brand">'+esc(brand.companyName)+'</div><h1>'+esc(project.name)+'</h1><p class="muted">'+esc(tr('รายการตรวจสอบสำหรับลูกค้า','Customer defect list'))+' · '+esc(project.inspectionDate)+'</p><small>'+esc(tr('ข้อมูล ณ เวลาส่งออก · สำหรับดูเท่านั้น ไม่เชื่อมข้อมูลสด','Exported snapshot · read-only, not live'))+'</small></div><label class="theme-control">'+tr('โทนสีเว็บ','Theme')+' <select id="theme"><option value="light">'+tr('สว่าง','Light')+'</option><option value="navy">'+tr('มืด','Dark')+'</option><option value="warm">'+tr('ครีม','Warm')+'</option></select></label></div><div class="stats">'+[[rows.length,tr('ทั้งหมด','Total')],[fixed,tr('แก้ไขแล้ว','Fixed')],[partial,tr('แก้แล้วแต่ยังไม่เรียบร้อย','Incomplete')],[rows.length-fixed-partial,tr('รอแก้ไข','Pending')]].map(([n,label])=>'<div><b>'+n+'</b>'+esc(label)+'</div>').join('')+'</div></header><div class="filters"><input id="q" type="search" aria-label="'+tr('ค้นหา','Search')+'" placeholder="'+tr('ค้นหาเลขข้อหรือข้อความ','Search number or text')+'"><select id="floor" aria-label="'+tr('ชั้น','Floor')+'">'+option('',tr('ทุกชั้น','All floors'))+floorOptions+'</select><select id="zone" aria-label="'+tr('โซน','Zone')+'">'+option('',tr('ทุกโซน','All zones'))+zoneOptions+'</select><select id="status" aria-label="'+tr('สถานะ','Status')+'">'+option('',tr('ทุกสถานะ','All statuses'))+option('fixed',tr('แก้ไขแล้ว','Fixed'))+option('partial',tr('แก้แล้วแต่ยังไม่เรียบร้อย','Incomplete'))+option('pending',tr('รอแก้ไข','Pending'))+'</select><select id="sev" aria-label="'+tr('ความรุนแรง','Severity')+'">'+option('',tr('ทุกความรุนแรง','All severities'))+option('urgent',tr('เร่งด่วน','Urgent'))+option('moderate',tr('ปานกลาง','Moderate'))+option('minor',tr('เล็กน้อย','Minor'))+'</select><div id="count"></div></div><section id="cards">'+cards.join('')+'</section><footer>'+esc(brand.companyName)+'</footer></main><button id="top" type="button">↑ '+tr('บนสุด','Top')+'</button><dialog id="viewer"><div class="viewer-bar"><strong id="viewer-title"></strong><div class="viewer-tools"><button id="minus" type="button" aria-label="Zoom out">−</button><span id="zoom">100%</span><button id="plus" type="button" aria-label="Zoom in">+</button><button id="fit" type="button">'+tr('พอดีจอ','Fit')+'</button><button id="close" type="button">× '+tr('ปิด','Close')+'</button></div></div><div id="viewer-scroll"><div id="viewer-content"><img id="large" alt=""><div id="large-plan" class="plan" hidden></div></div></div></dialog><script>'+ `
 const ids=['floor','zone','status','sev'];const q=document.getElementById('q'),cards=[...document.querySelectorAll('article')];function filter(){const term=q.value.trim().toLowerCase();let count=0;for(const el of cards){el.hidden=!(el.textContent.toLowerCase().includes(term)&&ids.every(id=>!document.getElementById(id).value||document.getElementById(id).value===el.dataset[id]));if(!el.hidden)count++}document.getElementById('count').textContent=count+' / '+cards.length}q.addEventListener('input',filter);ids.forEach(id=>document.getElementById(id).addEventListener('change',filter));filter();const theme=document.getElementById('theme');function applyTheme(value){const v=['light','navy','warm'].includes(value)?value:'light';document.documentElement.dataset.theme=v;theme.value=v;try{localStorage.setItem('customer-defect-theme',v)}catch{}}let saved='light';try{saved=localStorage.getItem('customer-defect-theme')||'light'}catch{}applyTheme(saved);theme.addEventListener('change',()=>applyTheme(theme.value));
 const viewer=document.getElementById('viewer'),large=document.getElementById('large'),largePlan=document.getElementById('large-plan'),content=document.getElementById('viewer-content'),scroller=document.getElementById('viewer-scroll');let zoom=1;
 function setZoom(value){zoom=Math.max(1,Math.min(4,value));const ratio=!largePlan.hidden?4/3:(large.naturalWidth&&large.naturalHeight?large.naturalWidth/large.naturalHeight:4/3);const maxH=window.innerHeight*(window.innerWidth<=720?.68:.75);const fitWidth=Math.min(scroller.clientWidth||window.innerWidth*.9,maxH*ratio);content.style.width=Math.max(1,fitWidth*zoom)+'px';document.getElementById('zoom').textContent=Math.round(zoom*100)+'%'}
 document.getElementById('cards').addEventListener('click',e=>{const b=e.target.closest('button.photo,button.plan');if(!b)return;const plan=b.classList.contains('plan');large.hidden=plan;largePlan.hidden=!plan;largePlan.replaceChildren();largePlan.className='plan';if(plan){const floor=[...b.classList].find(c=>/^floor-/.test(c));if(floor)largePlan.classList.add(floor);const pin=b.querySelector('.pin');if(pin)largePlan.appendChild(pin.cloneNode(true));}else{large.src=b.querySelector('img').src;large.alt=b.getAttribute('aria-label')||''}document.getElementById('viewer-title').textContent=b.getAttribute('aria-label')||'';viewer.showModal();setZoom(1);scroller.scrollTop=0;scroller.scrollLeft=0;});
 large.addEventListener('load',()=>{if(viewer.open&&!large.hidden)setZoom(zoom)});window.addEventListener('resize',()=>{if(viewer.open)setZoom(zoom)});document.getElementById('minus').onclick=()=>setZoom(zoom-.25);document.getElementById('plus').onclick=()=>setZoom(zoom+.25);document.getElementById('fit').onclick=()=>{setZoom(1);scroller.scrollTop=0;scroller.scrollLeft=0};document.getElementById('close').onclick=()=>viewer.close();viewer.addEventListener('click',e=>{if(e.target===viewer){const r=viewer.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)viewer.close()}});viewer.addEventListener('close',()=>{large.removeAttribute('src');largePlan.replaceChildren();largePlan.className='plan';setZoom(1)});document.getElementById('top').onclick=()=>window.scrollTo({top:0,behavior:'smooth'});`+'</script></body></html>';
 return {html,missing};
}

const REPORT_API='https://geleptwbxjoumxyxbhqa.supabase.co';
const REPORT_PUBLIC_KEY='sb_publishable_v-AeQKI2OT9QRGVP1HVHbQ_STCiFAnk';
const REPORT_BUCKET='inspection-client-reports';
type SharedLink={path:string;url:string;expiresAt:number};
function reportSession(){
 const s=JSON.parse(sessionStorage.getItem('tis_auth_tab_session_v1')||'null');
 if(!s?.access_token||!/^([0-9a-f-]{36})$/.test(s?.user?.id||'')||s.expires_at*1000<=Date.now())throw Error('กรุณาเข้าสู่ระบบใหม่ก่อนสร้างหรือยกเลิกลิงก์');
 return {id:s.user.id as string,headers:{apikey:REPORT_PUBLIC_KEY,Authorization:'Bearer '+s.access_token}};
}
async function storageRequest(path:string,method:string,body:BodyInit,contentType:string){
 const session=reportSession();
 const res=await fetch(REPORT_API+'/storage/v1/'+path,{method,headers:{...session.headers,'Content-Type':contentType},body,cache:'no-store'});
 if(!res.ok)throw Error('ระบบจัดเก็บออนไลน์ตอบกลับ '+res.status+' '+(await res.text()).slice(0,220));
 return res;
}
async function removeSharedReport(path:string){
 await storageRequest('object/'+REPORT_BUCKET,'DELETE',JSON.stringify({prefixes:[path]}),'application/json');
}
async function publishSharedReport(html:string,days:number):Promise<SharedLink>{
 const {id}=reportSession();
 const path=id+'/'+crypto.randomUUID()+'.bin';
 const key=crypto.getRandomValues(new Uint8Array(32)),iv=crypto.getRandomValues(new Uint8Array(12));
 const aes=await crypto.subtle.importKey('raw',key,'AES-GCM',false,['encrypt']);
 const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv},aes,new TextEncoder().encode(html));
 const payload=new Blob([iv,encrypted],{type:'application/octet-stream'});
 if(payload.size>47185920)throw Error('รายงานเกิน 45 MiB กรุณาลดขนาดรูปหรือส่งเป็น HTML/PDF');
 const fullPath=REPORT_BUCKET+'/'+path;
 let uploaded=false;
 try{
   await storageRequest('object/'+fullPath,'POST',payload,'application/octet-stream');uploaded=true;
   const expiresAt=Date.now()+days*86400000;
   const result=await (await storageRequest('object/sign/'+fullPath,'POST',JSON.stringify({expiresIn:days*86400}),'application/json')).json();
   const signed=new URL('/storage/v1'+result.signedURL,REPORT_API);
   if(signed.origin!==REPORT_API||signed.pathname!=='/storage/v1/object/sign/'+fullPath||!signed.searchParams.get('token'))throw Error('Invalid signed URL');
   const viewer=new URL('customer-report.html',window.location.href);
   viewer.hash=new URLSearchParams({u:signed.href,k:Array.from(key,v=>v.toString(16).padStart(2,'0')).join('')}).toString();
   return {path,url:viewer.href,expiresAt};
 }catch(e){if(uploaded)try{await removeSharedReport(path);}catch{}throw e;}
}

export function ClientWebsiteTab({project,brand,lang}:{project:ProjectFile;brand:BrandConfig;lang:AppLanguage}){
 const [busy,setBusy]=useState(false),[done,setDone]=useState(0),[message,setMessage]=useState('');
 const [days,setDays]=useState(7);
 const shareKey='tis_client_report_links_v1_'+project.id;
 const [links,setLinks]=useState<SharedLink[]>(()=>{try{const stored=JSON.parse(workspaceStorage.getItem(shareKey)||'[]');return Array.isArray(stored)?stored:[];}catch{return [];}});
 function saveLinks(next:SharedLink[]){workspaceStorage.setItem(shareKey,JSON.stringify(next));setLinks(next);}
 async function publish(){
   if(busy)return;
   if(!window.confirm(tr('สร้างลิงก์ออนไลน์สำหรับโครงการนี้? ผู้ที่ได้รับลิงก์สามารถดูและส่งต่อรายงานได้ โปรดยืนยันว่าคุณได้รับอนุญาตให้แชร์ข้อมูล','Publish this project snapshot? Anyone with the link can view and forward it. Confirm you are authorized to share.')))return;
   setBusy(true);setDone(0);setMessage('');
   try{reportSession();const {html,missing}=await buildClientWebsite(project,brand,lang,setDone);
     if(missing.length)throw Error(tr('มีรูปที่อ่านไม่ได้ กรุณาตรวจสอบ: ','Unavailable photos: ')+missing.join(', '));
     const link=await publishSharedReport(html,days);saveLinks([link,...links]);setMessage(tr('สร้างลิงก์สำเร็จ','Link created'));
   }catch(e){setMessage(tr('สร้างลิงก์ไม่สำเร็จ: ','Publish failed: ')+(e instanceof Error?e.message:String(e)));}
   finally{setBusy(false);}
 }
 async function revoke(link:SharedLink){
   if(busy||!window.confirm(tr('ยกเลิกลิงก์นี้? ลูกค้าจะไม่สามารถโหลดรายงานจากลิงก์เดิมได้อีก','Revoke this link? It will no longer load the report.')))return;
   setBusy(true);try{await removeSharedReport(link.path);saveLinks(links.filter(x=>x.path!==link.path));setMessage(tr('ยกเลิกลิงก์แล้ว','Link revoked'));}
   catch(e){setMessage(tr('ยกเลิกไม่สำเร็จ: ','Revoke failed: ')+(e instanceof Error?e.message:String(e)));}finally{setBusy(false);}
 }
 async function copyLink(url:string){try{await navigator.clipboard.writeText(url);setMessage(tr('คัดลอกลิงก์แล้ว','Link copied'));}catch{setMessage(tr('กรุณาคัดลอกลิงก์จากช่องข้อความ','Copy the link from the text field'));}}

 const tr=(th:string,en:string)=>lang==='en'?en:th;
 async function download(){
   if(busy)return;setBusy(true);setDone(0);setMessage('');
   try{const {html,missing}=await buildClientWebsite(project,brand,lang,setDone);const blob=new Blob([html],{type:'text/html;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=inspectionDownloadName(project,'html');document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);setMessage(missing.length?tr('สร้างไฟล์แล้ว แต่มีภาพอ่านไม่ได้: ','File created; unavailable photos: ')+missing.join(', '):tr('สร้างไฟล์เว็บไซต์แล้ว','Website file created'));}
   catch(e){setMessage(tr('สร้างไฟล์ไม่สำเร็จ: ','Export failed: ')+(e instanceof Error?e.message:String(e)));}
   finally{setBusy(false);}
 }
 return <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
   <h3 className="flex items-center gap-2 text-lg font-bold text-slate-900"><Globe className="w-5 h-5"/>{tr('ส่งออกเว็บไซต์สำหรับลูกค้า','Customer defect website')}</h3>
   <p className="text-sm text-slate-600">{tr('ส่งเฉพาะรายการ Defect ของโครงการนี้ พร้อมแปลนตำแหน่งหมุด ภาพก่อน–หลัง สาเหตุ วิธีแก้ไข สถานะ และตัวกรอง ใช้ดูบนคอมพิวเตอร์และมือถือ','Export this project’s defect list with pin locations, photos, details, statuses and filters for desktop and mobile.')}</p>
   <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">{tr('ไฟล์ HTML เปิดในเบราว์เซอร์ได้โดยไม่ใช้อินเทอร์เน็ต เป็นข้อมูล ณ เวลาส่งออก ไม่ใช่ลิงก์ออนไลน์หรือระบบอัปเดตสด ผู้ได้รับไฟล์สามารถส่งต่อและดูรูปได้ กรุณาส่งเฉพาะลูกค้าที่ได้รับอนุญาต','Offline HTML snapshot, not a hosted link or live synchronization. Anyone with the file can view and forward it; share only with authorized recipients.')}</div>
   <div className="rounded-xl border border-slate-200 p-4 space-y-3">
     <h4 className="font-bold text-slate-900">{tr('ลิงก์ออนไลน์สำหรับลูกค้า','Online customer links')}</h4>
     <p className="text-xs text-slate-600">{tr('รายงานแบบอ่านอย่างเดียว ณ เวลาส่งออก จัดเก็บแบบเข้ารหัส ผู้มีลิงก์สามารถเปิดดูหรือส่งต่อได้ ไม่ต้องเข้าสู่ระบบ ไม่อัปเดตข้อมูลสด','Encrypted read-only snapshot. Anyone with the link can view or forward it. No sign-in or live sync.')}</p>
     <div className="flex flex-wrap items-center gap-2">
       <label className="text-sm text-slate-700">{tr('อายุลิงก์','Expires in')} <select value={days} onChange={e=>setDays(Number(e.target.value))} disabled={busy} className="rounded-lg border border-slate-300 px-2 py-2">{[1,7,30].map(n=><option key={n} value={n}>{n} {tr('วัน','days')}</option>)}</select></label>
       <button type="button" onClick={publish} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy?<Loader2 className="w-4 h-4 animate-spin"/>:<Link2 className="w-4 h-4"/>}{tr('สร้างลิงก์เว็บไซต์ลูกค้า','Create customer link')}</button>
     </div>
     {links.map(link=><div key={link.path} className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
       <div className="text-xs text-slate-600">{link.expiresAt>Date.now()?tr('หมดอายุ: ','Expires: ')+new Date(link.expiresAt).toLocaleString(lang==='en'?'en-GB':'th-TH'):tr('หมดอายุแล้ว','Expired')}</div>
       <input readOnly value={link.url} onFocus={e=>e.target.select()} aria-label={tr('ลิงก์เว็บไซต์ลูกค้า','Customer link')} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"/>
       <div className="flex flex-wrap gap-2">
         <button type="button" onClick={()=>copyLink(link.url)} className="flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"><Copy className="w-4 h-4"/>{tr('คัดลอกลิงก์','Copy link')}</button>
         <a href={'https://social-plugins.line.me/lineit/share?url='+encodeURIComponent(link.url)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 rounded-lg bg-emerald-600 text-white px-3 py-2 text-sm"><Share2 className="w-4 h-4"/>{tr('แชร์ LINE','Share LINE')}</a>
         <a href={link.url} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-slate-300 px-3 py-2 text-sm">{tr('เปิดดู','Preview')}</a>
         <button type="button" disabled={busy} onClick={()=>revoke(link)} className="flex items-center gap-1 rounded-lg border border-rose-300 px-3 py-2 text-sm text-rose-700 disabled:opacity-50"><Trash2 className="w-4 h-4"/>{tr('ยกเลิกลิงก์ / ลบไฟล์','Revoke / delete')}</button>
       </div>
     </div>)}
     <p className="text-xs text-slate-500">{tr('ลิงก์หมดอายุแล้วจะเปิดไม่ได้ แต่ไฟล์ยังใช้พื้นที่จัดเก็บจนกว่าจะกดยกเลิก/ลบไฟล์ การยกเลิกไม่ลบสำเนาที่ลูกค้าเคยบันทึกไว้','Expired links cannot be opened, but stored files occupy space until deleted. Revocation cannot erase copies already saved.')}</p>
   </div>
   <button type="button" onClick={download} disabled={busy} className="inline-flex items-center gap-2 rounded-xl brand-bg px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy?<Loader2 className="w-4 h-4 animate-spin"/>:<Download className="w-4 h-4"/>}{busy?tr('กำลังสร้างเว็บไซต์ ','Generating website ')+done+'/'+project.defects.length:tr('ดาวน์โหลดเว็บไซต์ (.html)','Download website (.html)')}</button>
   {message&&<p role="status" className="text-sm text-slate-700 break-words">{message}</p>}
 </section>;
}
