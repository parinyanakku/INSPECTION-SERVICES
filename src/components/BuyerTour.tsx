import {useEffect,useRef,useState} from 'react';
import {BookOpen,ChevronLeft,ChevronRight,X} from 'lucide-react';
import type {AppLanguage,WorkspaceTab} from '../types/inspection';
import {workspaceStorage} from '../utils/workspaceStorage';

const KEY='tis_buyer_guided_tour_v2';
type Step={target:string;th:string;en:string;bodyTh:string;bodyEn:string;tab?:WorkspaceTab};
const steps:Step[]=[
 {target:'brand',th:'ตั้งค่าชื่อผู้ตรวจสอบและบริษัท',en:'Set your inspector and company details',bodyTh:'บนมือถือกดตั้งค่าโปรแกรมเพื่อแสดงเมนู แล้วกดแก้ไขข้อมูลบริษัท/โลโก้ กรอกชื่อผู้ตรวจสอบ เลขใบอนุญาต (ถ้ามี) และข้อมูลติดต่อของคุณ แล้วบันทึก',bodyEn:'On mobile, open Settings, then Company & Logo. Enter your own inspector details, license if applicable, and contact information, then save.'},
 {target:'api',th:'ตั้งค่า AI (ไม่บังคับ)',en:'Configure AI (optional)',bodyTh:'บนมือถือเปิดตั้งค่าโปรแกรมก่อน แล้วตั้งค่า API Key ของคุณเอง หากยังไม่มีให้กดวิธีรับ API Key สามารถข้ามขั้นตอนนี้และสร้าง Defect ด้วยตนเองได้',bodyEn:'On mobile, open Settings first. Set your own API key, or open the API key guide. You can skip this step and enter defects manually.'},
 {target:'project',th:'สร้างหรือเปิดแฟ้มโครงการ',en:'Create or open a project',bodyTh:'สร้างแฟ้มใหม่ กรอกชื่อโครงการ เจ้าของบ้าน ที่อยู่ และวันที่ตรวจรับ กดบันทึก แล้วเปิดแฟ้มที่สร้างขึ้น หรือใช้แฟ้มเดิมของคุณ',bodyEn:'Create a project with its name, owners, address and inspection date, save it, then open it. You can also use an existing project.'},
 {target:'floor',tab:'studio',th:'เพิ่มแปลนบ้าน',en:'Add a floor plan',bodyTh:'เปิดแท็บแปลน & AI บนมือถือ เลือกชั้น แล้วอัปโหลดภาพแปลนของชั้นนั้น หากไม่มีภาพสามารถสร้างผังเองได้ ตรวจสอบให้ตรงกับหน้างาน',bodyEn:'On mobile, open Plan & AI. Select a floor and upload its plan. If you do not have an image, draw a plan instead. Verify it against the property.'},
 {target:'zone',tab:'studio',th:'กำหนดโซนบนแปลน',en:'Set up plan zones',bodyTh:'กดตั้งค่าโซน เพิ่มหรือแก้ไขชื่อและขอบเขต เช่น โรงจอดรถ ห้องนอน ห้องน้ำ แล้วกดเสร็จสิ้นการตั้งค่าโซน',bodyEn:'Open zone settings, add or edit room boundaries and names, then finish zone setup.'},
 {target:'photo',tab:'studio',th:'อัปโหลดภาพจุดบกพร่อง',en:'Upload a defect photo',bodyTh:'เลือกรูปหน้างาน ใช้เครื่องมือวงกลม ลูกศร เส้นตรง หรือข้อความระบุจุดที่ตรวจพบ และขยายภาพได้',bodyEn:'Upload site evidence and mark the issue with circles, arrows, lines or text. Zoom in if needed.'},
 {target:'analyze',tab:'studio',th:'สร้างรายละเอียด Defect',en:'Create defect details',bodyTh:'เลือกวิเคราะห์ภาพด้วย AI หรือสร้างรายการเปล่า ตรวจสอบหัวข้อ สาเหตุ วิธีแก้ไข และความรุนแรงด้วยตนเองก่อนบันทึก',bodyEn:'Analyze with AI or create a blank draft. Review the title, cause, repair method and severity yourself before saving.'},
 {target:'pin',tab:'studio',th:'เลือกโซนและปักหมุด',en:'Select a zone and place a pin',bodyTh:'เมื่อมีรายการร่าง ให้เลือกโซนในขั้นที่ 1 ระบบจะเลื่อนไปหาโซน จากนั้นคลิกตำแหน่งจริงบนแปลนเพื่อบันทึกหมุด',bodyEn:'With a draft ready, select its zone first. Then click the actual location on the plan to place the pin.'},
 {target:'tab-list',tab:'list',th:'ตรวจสอบรายการ Defect',en:'Review the defect list',bodyTh:'เปิดแท็บ Defect (บนมือถือแสดงชื่อแบบย่อ) ตรวจสอบข้อมูลทุกข้อ กรองตามชั้นหรือโซน แก้ไขรายละเอียด และเพิ่มรูปหลังแก้ไขเมื่อมีการตรวจติดตาม',bodyEn:'Open the Defect tab (short label on mobile) to review, filter, edit details and add after-repair photos during follow-up.'},
 {target:'report',tab:'export',th:'สร้างเล่มรายงาน',en:'Export the inspection report',bodyTh:'เปิดแท็บรายงานบนมือถือ เลือกตรวจครั้งแรกหรือแบบตรวจติดตาม แล้วดาวน์โหลด PDF, Word, Excel แยกไฟล์หรือครบทั้งสามไฟล์',bodyEn:'On mobile, open Reports. Choose first inspection or follow-up, then download PDF, Word and Excel individually or together.'},
 {target:'client',tab:'client',th:'ส่งเว็บไซต์ให้ลูกค้า',en:'Share the customer website',bodyTh:'เปิดแท็บเว็บไซต์ลูกค้า เลือกดาวน์โหลด HTML หรือสร้างลิงก์ออนไลน์ กำหนดวันหมดอายุและคัดลอกส่ง LINE เฉพาะผู้ได้รับอนุญาต',bodyEn:'Open Customer website, download HTML or create an expiring link and share it only with authorized recipients.'},
 {target:'drive-json-shortcut',th:'สำรอง JSON ล่าสุดไป Google Drive',en:'Back up latest JSON to Google Drive',bodyTh:'บันทึกงานก่อน กด Google Drive (JSON) แล้วเลือกส่ง JSON ล่าสุดขึ้น Drive บนเครื่องที่มีงานล่าสุด ยืนยันจำนวนแฟ้มและ Defect รอจนระบบแจ้งส่ง JSON สำเร็จและแสดงเวลาบันทึกกับจำนวน Defect ที่ตรงกับเครื่อง มือถือโหลด JSON ต้นฉบับโดยตรง ไม่ต้องสร้างฉบับมือถือแยก รูปและรายงานคงความละเอียดเดิมและเก็บไฟล์ฉบับก่อนหน้าไว้',bodyEn:'Save your work, open Google Drive (JSON) and choose Send latest JSON to Drive on the device with the intended latest work. Confirm project and defect counts. Wait for confirmed upload completion and check the Drive timestamp and defect count. Mobile loads the original JSON directly without a second copy. Original image resolution and earlier Drive revisions are retained.'},
 {target:'drive',th:'โหลด JSON ล่าสุดและซิงค์ข้ามเครื่อง',en:'Load latest JSON and sync devices',bodyTh:'เปิด Google Drive Sync บนคอมและมือถือด้วยบัญชี Google และบัญชีโปรแกรมเดียวกัน อัปเดตทั้งสองเครื่องเป็นรุ่นล่าสุด กดโหลด JSON ล่าสุดจาก Drive ระบบแสดงความคืบหน้าและตรวจสอบความถูกต้องก่อนบันทึกลงเครื่อง ตรวจจำนวนแฟ้ม Defect และเวลาบันทึก หาก Google ตอบ HTTP 500 ระบบลองอ่านใหม่อัตโนมัติ ควรใช้แท็บ Safari ปกติ ไม่ใช่โหมดส่วนตัว รูปและรายงานคงความละเอียดเดิม กดส่ง JSON ล่าสุดจากเครื่องที่มีการแก้ไขเพื่อสร้างฉบับล่าสุดบน Drive โดยไม่ต้องให้คอมเปิดรอรับงานใหม่ เปิดซิงค์อัตโนมัติแล้วกลับหน้าแฟ้มโครงการเพื่อรับงานจากอีกเครื่อง เปิดหน้าต่าง Drive ค้างไว้เพื่อดูจำนวนแฟ้มและ Defect ได้ หากมีข้อมูลขัดแย้งกัน ระบบหยุดเพื่อป้องกันการเขียนทับ ให้สำรองทั้งสองเครื่องก่อน หากต้องกู้คืนย้อนหลังให้เปิดเพิ่มเติม',bodyEn:'Open Drive sync on either device using the same app and Google accounts. Update both devices, then choose Load latest JSON from Drive. Progress and integrity checks precede local saving. Compare project count, defect count and timestamp. Temporary Google server errors trigger automatic read retries; use a normal Safari tab, not Private Browsing. Original photos and reports are preserved. Send the latest JSON from the device with saved changes to publish a new revision directly, without waiting for the computer. With auto sync on, return to the project list to receive changes. You can keep the Drive dialog open to see the updated counts. Conflicting edits are blocked; back up both devices first. Expand More for previous backups.'},
 {target:'backup',th:'บันทึกและสำรองข้อมูล',en:'Save and back up your work',bodyTh:'กลับไปคลังแฟ้มโครงการแล้วสำรอง JSON เก็บไว้ในเครื่องเป็นระยะ โดยเฉพาะก่อนเปลี่ยนเครื่องหรือเบราว์เซอร์ หาก Drive แจ้งข้อมูลแก้ไขต่างกัน ให้เก็บ JSON ทั้งสองเครื่องก่อนแก้ไข',bodyEn:'Return to the project hub and regularly save JSON backups, especially before changing devices or browsers. If Drive reports conflicting edits, back up both devices first.'},
];
// Automatically re-offer the guide when its lesson content changes, not on every technical build.
const guideRevision=JSON.stringify(steps).split('').reduce((h,c)=>Math.imul(h^c.charCodeAt(0),16777619)>>>0,2166136261).toString(16);
type Props={lang:AppLanguage;active:boolean;hasProject:boolean;hasProjects:boolean;tab:WorkspaceTab;paused:boolean;onClose:()=>void};
export function BuyerTour({lang,active,hasProject,hasProjects,tab,paused,onClose}:Props){
 const [index,setIndex]=useState(0),[rect,setRect]=useState<{left:number;top:number;width:number;height:number}|null>(null),[hint,setHint]=useState(false);
 const panel=useRef<HTMLDivElement>(null);
 const tr=(th:string,en:string)=>lang==='en'?en:th;
 const step=steps[index];
 let target=step.target;
 if(step.tab&&!hasProject)target=hasProjects?'open-project':'project';
 else if(step.target==='project'&&!hasProject&&hasProjects)target='open-project';
 else if(step.tab&&step.tab!==tab)target='tab-'+step.tab;
 if(step.target==='project'&&hasProject)target='tab-studio';
 if((step.target==='backup'||step.target==='drive')&&hasProject)target='hub';
 useEffect(()=>{if(!active){setIndex(0);setRect(null);}},[active]);
 useEffect(()=>{
   if(!active||paused){setRect(null);return;}
   let raf=0,last:Element|null=null;
   const find=()=>Array.from(document.querySelectorAll('[data-tour="'+target+'"]')).find(el=>{const r=el.getBoundingClientRect();return r.width>0&&r.height>0;})||null;
   function measure(){
     const el=find();
     if(el!==last){last=el;if(el)el.scrollIntoView({block:'center',inline:'nearest',behavior:'auto'});}
     if(!el){setRect(null);setHint(true);return;}
     const r=el.getBoundingClientRect();setHint(false);
     setRect({left:r.left,top:r.top,width:r.width,height:r.height});
   }
   const schedule=()=>{cancelAnimationFrame(raf);raf=requestAnimationFrame(measure);};
   measure();
   const observer=new MutationObserver(records=>{if(records.some(r=>!panel.current?.contains(r.target)))schedule();});
   observer.observe(document.body,{childList:true,subtree:true});
   window.addEventListener('scroll',schedule,true);window.addEventListener('resize',schedule);
   return()=>{cancelAnimationFrame(raf);observer.disconnect();window.removeEventListener('scroll',schedule,true);window.removeEventListener('resize',schedule);};
 },[active,paused,target,index]);
 useEffect(()=>{if(!active||paused)return;const fn=(e:KeyboardEvent)=>{if(e.key==='Escape'){onClose();}};window.addEventListener('keydown',fn);return()=>window.removeEventListener('keydown',fn);},[active,paused,onClose]);
 if(!active||paused)return null;
 const panelTop=!!rect&&rect.top>window.innerHeight*.48;
 const needProject=!!step.tab&&!hasProject;
 const needTab=!!step.tab&&hasProject&&step.tab!==tab;
 return <div data-tour-overlay="true" style={{position:'fixed',inset:0,zIndex:9500,pointerEvents:'none'}}>
   {rect&&<div aria-hidden="true" style={{position:'fixed',left:Math.max(2,rect.left-5),top:Math.max(2,rect.top-5),width:Math.min(rect.width+10,window.innerWidth-4),height:rect.height+10,border:'3px solid #38bdf8',borderRadius:12,boxShadow:'0 0 0 4px #0ea5e940',pointerEvents:'none'}}/>}
   <div ref={panel} role="region" aria-label={tr('แนะนำการใช้งาน','Guided tour')} style={{position:'fixed',left:'50%',transform:'translateX(-50%)',...(panelTop?{top:12}:{bottom:12}),width:'min(94vw,470px)',maxHeight:'46dvh',overflowY:'auto',pointerEvents:'auto',background:'#0f172a',color:'#f8fafc',border:'1px solid #38bdf8',borderRadius:16,padding:16,boxShadow:'0 10px 32px #0006'}}>
    <div style={{display:'flex',alignItems:'center',gap:8,justifyContent:'space-between',fontSize:12,color:'#bae6fd'}}><span style={{display:'flex',alignItems:'center',gap:5}}><BookOpen size={16}/>{tr('แนะนำการใช้งาน','Guided tour')} · {index+1}/{steps.length}</span><button type="button" onClick={onClose} aria-label={tr('ปิดบทแนะนำ','Close tour')} style={{padding:6}}><X size={20}/></button></div>
    <div aria-hidden="true" style={{height:4,background:'#334155',borderRadius:5,margin:'8px 0 12px'}}><div style={{height:'100%',width:((index+1)/steps.length*100)+'%',background:'#38bdf8',borderRadius:5}}/></div>
    <h3 style={{fontSize:17,fontWeight:700,margin:'0 0 7px'}}>{tr(step.th,step.en)}</h3>
    <p style={{fontSize:13,lineHeight:1.65,margin:0}}>{tr(step.bodyTh,step.bodyEn)}</p>
    {(needProject||needTab||hint)&&<p style={{fontSize:12,color:'#bae6fd',margin:'8px 0 0'}}>{needProject?tr('เปิดหรือสร้างแฟ้มจริงก่อนเพื่อฝึกขั้นตอนนี้','Open or create a real project first.'):needTab?tr('กดแท็บที่ไฮไลต์เพื่อเปิดหน้าที่เกี่ยวข้อง','Select the highlighted tab to continue.'):tr('หากไม่เห็นปุ่ม ให้ทำขั้นตอนก่อนหน้าหรือข้ามไปได้','If the control is unavailable, complete the previous step or skip.')}</p>}
    <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',marginTop:13}}>
     <button type="button" disabled={index===0} onClick={()=>setIndex(v=>Math.max(0,v-1))} style={{display:'flex',alignItems:'center',gap:3,padding:'8px 10px',border:'1px solid #64748b',borderRadius:8,opacity:index===0?.45:1}}><ChevronLeft size={16}/>{tr('ย้อนกลับ','Back')}</button>
     <button type="button" onClick={onClose} style={{fontSize:12,padding:8}}>{tr('ข้ามบทแนะนำ','Skip tour')}</button>
     <button type="button" onClick={()=>index===steps.length-1?onClose():setIndex(v=>v+1)} style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:4,padding:'8px 13px',background:'#2563eb',borderRadius:8,fontWeight:700}}>{index===steps.length-1?tr('เสร็จสิ้น','Finish'):tr('ถัดไป','Next')}<ChevronRight size={16}/></button>
    </div>
   </div>
 </div>;
}
export function buyerTourSeen(){try{return workspaceStorage.getItem(KEY)===guideRevision;}catch{return false;}}
export function markBuyerTourSeen(){try{workspaceStorage.setItem(KEY,guideRevision);}catch{}}
