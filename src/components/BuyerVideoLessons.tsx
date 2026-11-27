import {useEffect,useState} from 'react';
import {Film,Play,Pause,RotateCcw,ChevronLeft,ChevronRight,X,MousePointer2} from 'lucide-react';
import type {AppLanguage} from '../types/inspection';

type Scene={th:string;en:string;captionTh:string;captionEn:string;controls:[string,string][];focus:number};
const scenes:Scene[]=[
 {th:'ตั้งค่าบริษัท',en:'Company setup',captionTh:'เปิดแก้ไขข้อมูลบริษัท/โลโก้ กรอกชื่อผู้ตรวจสอบและเลขใบอนุญาตของคุณ แล้วบันทึก',captionEn:'Open Company & Logo, enter your own inspector details and save.',controls:[['แก้ไขข้อมูลบริษัท/โลโก้','Company & Logo'],['ชื่อผู้ตรวจสอบ','Inspector name'],['เลขใบอนุญาต (ถ้ามี)','License (optional)'],['บันทึก','Save']],focus:0},
 {th:'ตั้งค่า AI',en:'AI setup',captionTh:'ตั้งค่า API Key ของคุณเอง หรือข้ามขั้นตอนนี้หากต้องการสร้าง Defect ด้วยตนเอง',captionEn:'Set your own API key or skip this step for manual defect entry.',controls:[['วิธีรับ API Key','Get API key'],['ตั้งค่า API Key','API key settings'],['บันทึก','Save']],focus:1},
 {th:'สร้างแฟ้มโครงการ',en:'Create a project',captionTh:'กดสร้างแฟ้มโครงการใหม่ กรอกชื่อโครงการ เจ้าของบ้าน ที่อยู่ และวันที่ตรวจรับ แล้วบันทึก',captionEn:'Create a project, enter the name, owner, address and inspection date, then save.',controls:[['สร้างแฟ้มโครงการใหม่','New project'],['ชื่อโครงการ / เจ้าของบ้าน','Project / owner'],['ที่อยู่ / วันที่ตรวจรับ','Address / inspection date'],['บันทึก','Save']],focus:0},
 {th:'อัปโหลดแปลน',en:'Upload floor plans',captionTh:'เปิดสตูดิโอ เลือกชั้นที่ต้องการ แล้วอัปโหลดภาพแปลนให้ตรงกับหน้างาน',captionEn:'Open the studio, select a floor and upload its correct plan.',controls:[['ชั้น 1 / ชั้น 2','Floor 1 / Floor 2'],['อัปโหลดรูปแปลนชั้นนี้','Upload floor plan'],['พอดีจอ','Fit view']],focus:1},
 {th:'ตั้งค่าโซน',en:'Set up zones',captionTh:'กดตั้งค่าโซน เพิ่มพื้นที่ กำหนดชื่อห้องและขอบเขต จากนั้นบันทึกการตั้งค่า',captionEn:'Open zone settings, define room names and boundaries, then finish setup.',controls:[['ตั้งค่าโซน','Zone settings'],['เพิ่มโซนใหม่','Add zone'],['ห้องนั่งเล่น / ห้องน้ำ','Living room / Bathroom'],['เสร็จสิ้นตั้งค่าโซน','Finish zone setup']],focus:1},
 {th:'อัปโหลดและมาร์กรูป',en:'Upload and annotate photos',captionTh:'อัปโหลดรูปหน้างาน ใช้วงกลม ลูกศร หรือข้อความเพื่อระบุจุดบกพร่อง',captionEn:'Upload a site photo and mark the defect with circles, arrows or text.',controls:[['อัปโหลดรูปหน้างาน','Upload photo'],['วงกลม / ลูกศร / เส้นตรง','Circle / Arrow / Line'],['พิมพ์ข้อความ','Add text'],['ขยายเต็มจอ','Full screen']],focus:1},
 {th:'สร้างรายการ Defect',en:'Create a defect',captionTh:'วิเคราะห์ด้วย AI หรือกรอกเอง ตรวจสอบหัวข้อ สาเหตุ วิธีแก้ไข และความรุนแรงก่อนบันทึก',captionEn:'Analyze with AI or enter details manually. Review the cause, repair and severity.',controls:[['วิเคราะห์ภาพด้วย AI','Analyze with AI'],['สร้างรายการเปล่า','Manual entry'],['หัวข้อ / สาเหตุ / วิธีแก้ไข','Title / Cause / Solution']],focus:0},
 {th:'เลือกโซนและปักหมุด',en:'Select zone and pin',captionTh:'เลือกโซนก่อน แล้วคลิกตำแหน่งจริงบนแปลนเพื่อบันทึกหมุดประจำข้อ',captionEn:'Select a zone first, then click the actual location on the plan.',controls:[['1. เลือกโซน','1. Select zone'],['2. คลิกตำแหน่งปักหมุด','2. Place pin'],['แปลนบ้าน · หมุด #1','Floor plan · Pin #1']],focus:1},
 {th:'ตรวจสอบรายการ',en:'Review defects',captionTh:'เปิดรายการ Defect ค้นหาตามชั้นหรือโซน กดแก้ไขรายละเอียดและเพิ่มรูปหลังแก้ไขเมื่อตรวจติดตาม',captionEn:'Review and filter defects, edit details and add after photos on follow-up.',controls:[['รายการ Defect','Defect list'],['ค้นหา / ทุกชั้น / ทุกโซน','Search / Floor / Zone'],['แก้ไข / รูปภาพ','Edit / Photos'],['เพิ่มรูปหลังแก้ไข','Add after photo']],focus:2},
 {th:'ส่งออกรายงาน',en:'Export reports',captionTh:'เลือกรูปแบบตรวจครั้งแรกหรือตรวจติดตาม แล้วดาวน์โหลด PDF, Word, Excel หรือทั้งสามไฟล์',captionEn:'Choose first inspection or follow-up, then download the report formats.',controls:[['ตรวจครั้งแรก / ตรวจติดตาม','First inspection / Follow-up'],['PDF / Word / Excel','PDF / Word / Excel'],['ดาวน์โหลดทั้ง 3 ไฟล์','Download all 3 files']],focus:2},
 {th:'แชร์เว็บไซต์ลูกค้า',en:'Share customer website',captionTh:'สร้างลิงก์เว็บไซต์ลูกค้า กำหนดวันหมดอายุ คัดลอกหรือแชร์ LINE เฉพาะผู้มีสิทธิ์ดู',captionEn:'Create an expiring customer link and share it with authorized recipients.',controls:[['เว็บไซต์ลูกค้า','Customer website'],['สร้างลิงก์เว็บไซต์ลูกค้า','Create customer link'],['คัดลอกลิงก์ / แชร์ LINE','Copy / Share LINE']],focus:1},
 {th:'สำรองข้อมูล',en:'Back up data',captionTh:'กลับคลังแฟ้มโครงการ สำรอง JSON เก็บไว้ในเครื่อง หรือเชื่อม Google Drive เพื่อซิงค์งาน',captionEn:'Return to the project hub, export a JSON backup or connect Google Drive.',controls:[['คลังแฟ้มโครงการ','Project hub'],['สำรองข้อมูล (JSON)','Backup JSON'],['ซิงค์ Google Drive','Google Drive sync']],focus:1},
];
const duration=9;
export function BuyerVideoLessons({lang,onClose,onTour}:{lang:AppLanguage;onClose:()=>void;onTour:()=>void}){
 const [time,setTime]=useState(0),[playing,setPlaying]=useState(false),[speed,setSpeed]=useState(1);
 const total=scenes.length*duration,index=Math.min(scenes.length-1,Math.floor(time/duration)),scene=scenes[index],elapsed=Math.min(duration,time-index*duration);
 const tr=(th:string,en:string)=>lang==='en'?en:th;
 useEffect(()=>{if(!playing)return;let last=performance.now(),frame=0;const tick=(now:number)=>{const delta=Math.min(0.2,(now-last)/1000);last=now;setTime(t=>Math.min(total,t+delta*speed));frame=requestAnimationFrame(tick);};frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);},[playing,speed,total]);
 useEffect(()=>{if(time>=total)setPlaying(false);},[time,total]);
 useEffect(()=>{const fn=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose();};window.addEventListener('keydown',fn);return()=>window.removeEventListener('keydown',fn);},[onClose]);
 const go=(i:number)=>setTime(Math.max(0,Math.min(scenes.length-1,i))*duration);
 const stamp=(v:number)=>Math.floor(v/60)+':'+String(Math.floor(v%60)).padStart(2,'0');
 const activeControl=scene.focus;
 return <div className="fixed inset-0 z-[9600] bg-slate-950/75 flex items-center justify-center p-2 sm:p-4" onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
  <section role="dialog" aria-modal="true" aria-label={tr('วิดีโอสอนใช้งาน','Video-style lessons')} className="w-full max-w-5xl max-h-[94dvh] overflow-y-auto rounded-2xl border border-slate-500 shadow-2xl" style={{background:'#0f172a',color:'#f8fafc'}}>
   <header className="p-4 flex items-center gap-2 border-b border-slate-700"><Film size={21}/><h2 className="font-bold flex-1">{tr('บทเรียนสาธิตแบบวิดีโอ','Animated walkthrough lessons')}</h2><button type="button" onClick={onClose} aria-label={tr('ปิด','Close')} className="p-2"><X size={22}/></button></header>
   <div className="grid md:grid-cols-[minmax(0,1fr)_250px] gap-3 p-3">
    <div className="min-w-0 space-y-3">
     <div className="relative rounded-xl border border-slate-600 p-3 sm:p-5 overflow-hidden min-h-[270px]" style={{background:'#1e293b'}}>
      <div className="text-xs text-sky-300 mb-2">{tr('หน้าจอจำลอง · ไม่มีข้อมูลจริง','Simulated screen · no real data')} · {index+1}/{scenes.length}</div>
      <h3 className="text-lg sm:text-xl font-bold mb-4">{tr(scene.th,scene.en)}</h3>
      <div className="grid sm:grid-cols-2 gap-2">
       {scene.controls.map(([th,en],i)=><div key={i} className="relative rounded-lg border p-3 min-h-[56px] flex items-center text-sm" style={{borderColor:i===activeControl?'#38bdf8':'#475569',background:i===activeControl?'#164e63':'#334155',boxShadow:i===activeControl&&elapsed>1?'0 0 0 3px #38bdf844':'none'}}>{tr(th,en)}{i===activeControl&&elapsed>1&&<MousePointer2 aria-hidden="true" size={24} className="absolute right-2 bottom-1 text-white" style={{transform:'translateY('+Math.round(Math.max(0,2-elapsed)*12)+'px)'}}/>}</div>)}
      </div>
      <div className="mt-5 rounded-lg p-3 text-sm leading-relaxed" style={{background:'#020617',color:'#f1f5f9'}}>{tr(scene.captionTh,scene.captionEn)}</div>
     </div>
     <div className="flex items-center gap-2"><span className="text-xs tabular-nums">{stamp(time)}</span><input type="range" min={0} max={total} step={0.1} value={time} onChange={e=>setTime(Number(e.target.value))} aria-label={tr('ตำแหน่งการเล่น','Playback position')} className="flex-1 min-w-0 accent-sky-400"/><span className="text-xs tabular-nums">{stamp(total)}</span></div>
     <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={()=>go(index-1)} disabled={index===0} className="p-2 rounded border border-slate-600 disabled:opacity-40" aria-label={tr('บทก่อนหน้า','Previous')}><ChevronLeft size={19}/></button>
      <button type="button" onClick={()=>{if(time>=total)setTime(0);setPlaying(v=>!v);}} className="flex gap-2 items-center bg-blue-600 px-4 py-2 rounded font-semibold">{playing?<Pause size={18}/>:<Play size={18}/>} {playing?tr('หยุดชั่วคราว','Pause'):tr('เล่น','Play')}</button>
      <button type="button" onClick={()=>go(index+1)} disabled={index===scenes.length-1} className="p-2 rounded border border-slate-600 disabled:opacity-40" aria-label={tr('บทถัดไป','Next')}><ChevronRight size={19}/></button>
      <button type="button" onClick={()=>{setTime(0);setPlaying(false);}} className="p-2 rounded border border-slate-600" aria-label={tr('เริ่มใหม่','Restart')}><RotateCcw size={18}/></button>
      <label className="ml-auto flex items-center gap-1 text-xs">{tr('ความเร็ว','Speed')}<select value={speed} onChange={e=>setSpeed(Number(e.target.value))} style={{background:'#334155',color:'white'}} className="rounded border border-slate-500 p-1">{[.5,1,1.25,1.5,2].map(n=><option key={n} value={n}>{n}×</option>)}</select></label>
     </div>
     <p className="text-xs text-slate-300">{tr('บทเรียนเป็นภาพเคลื่อนไหวพร้อมคำบรรยาย ไม่ใช่วิดีโอบันทึกหน้าจอจริง และไม่มีเสียง','Animated demonstration with captions, not an actual screen recording. No audio.')}</p>
     <button type="button" onClick={onTour} className="rounded-lg border border-sky-400 text-sky-200 px-3 py-2 text-sm">{tr('ทดลองทำตามบนโปรแกรมจริง','Try the interactive guided tour')}</button>
    </div>
    <aside aria-label={tr('เลือกบทเรียน','Chapters')} className="space-y-1 max-h-[400px] overflow-y-auto"><h3 className="font-bold text-sm mb-2">{tr('เลือกบทเรียน','Chapters')}</h3>{scenes.map((s,i)=><button type="button" key={i} onClick={()=>go(i)} aria-current={index===i?'step':undefined} className="block text-left w-full rounded-lg px-3 py-2 text-sm" style={{background:index===i?'#1d4ed8':'#1e293b',color:'#f8fafc'}}>{i+1}. {tr(s.th,s.en)}</button>)}</aside>
   </div>
  </section>
 </div>;
}
