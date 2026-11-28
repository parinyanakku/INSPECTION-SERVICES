import React,{useEffect,useState} from 'react';
import type {AppLanguage} from '../types/inspection';
import {providers,providerNames,type Provider,type EngineSettings} from '../utils/aiRouterPolicy';
import {loadAIEngine,saveAIEngine,getKey,getModel,listAIModels} from '../utils/aiReportEngine';
const docs:Record<Provider,string>={gemini:'https://aistudio.google.com/apikey',openai:'https://platform.openai.com/api-keys',claude:'https://platform.claude.com/settings/keys',deepseek:'https://platform.deepseek.com/api_keys',grok:'https://console.x.ai/',openrouter:'https://openrouter.ai/keys'};
export function AIEngineSettings({lang,disabled=false}:{lang:AppLanguage;disabled?:boolean}){
 const en=lang==='en',tr=(a:string,b:string)=>en?b:a;
 const [s,setS]=useState<EngineSettings>(loadAIEngine),[open,setOpen]=useState(false),[p,setP]=useState<Provider>('gemini'),[models,setModels]=useState<string[]>([]),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 useEffect(()=>{const f=()=>setS(loadAIEngine());window.addEventListener('tis-ai-engine-change',f);return()=>window.removeEventListener('tis-ai-engine-change',f);},[]);
 const c=s.configs[p]||{key:'',model:'',enabled:false};
 const patch=(x:Partial<typeof c>)=>{setS(old=>({...old,configs:{...old.configs,[p]:{...c,...x}}}));setNotice('');};
 const off=busy||disabled;
 async function load(){setBusy(true);setNotice('');setModels([]);try{const list=await listAIModels(p,getKey(s,p));setModels(list);setNotice(list.length?tr('โหลดรายชื่อโมเดลแล้ว (ยังไม่ทดสอบสร้างข้อความ)','Model list loaded (generation not tested)'):tr('ไม่พบโมเดลที่รองรับ','No supported models'));}catch(e){setNotice(e instanceof Error&&e.message==='AI_LOCAL_RATE_LIMIT'?tr('เรียก AI รายงานถี่เกินไป กรุณาลองอีกครั้งในนาทีถัดไป','Too many report AI requests. Retry in the next minute.'):tr('โหลดโมเดลไม่ได้ ตรวจคีย์ การเชื่อมต่อ หรือสิทธิ์บัญชี','Could not list models. Check key, connection or account access.'));}finally{setBusy(false);}}
 async function save(){setBusy(true);setNotice('');try{await saveAIEngine(s);setNotice(tr('บันทึกเฉพาะบัญชีนี้บนเครื่องนี้แล้ว','Saved locally for this account.'));}catch{setNotice(tr('บันทึกไม่สำเร็จ','Settings save failed'));}finally{setBusy(false);}}
 const label='block text-xs font-semibold text-slate-700';
 return <div className="rounded-xl border border-indigo-300 p-3 space-y-3">
  <button type="button" aria-expanded={open} onClick={()=>setOpen(!open)} className="w-full flex justify-between text-sm font-bold text-indigo-800"><span>{tr('ตั้งค่า AI Engine — งานรายงาน','AI Engine settings — reports')}</span><span>{open?'−':'+'}</span></button>
  <p className="text-xs text-slate-600">{tr('ตั้งค่าหลายค่ายสำหรับงานรายงาน ส่วน Defect และแปลนยังใช้ Gemini เดิม','Multi-provider report settings. Defects and plan tracing still use the existing Gemini setup.')}</p>
  {open&&<>
   <label className={label}>{tr('ผู้ให้บริการ','Provider')}<select value={p} disabled={off} onChange={e=>{setP(e.target.value as Provider);setModels([]);setNotice('');}} className="block w-full border rounded-lg p-2 mt-1">{providers.map(id=><option key={id} value={id}>{providerNames[id]}{s.configs[id]?.enabled?' ✓':''}</option>)}</select></label>
   <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={c.enabled} disabled={off} onChange={e=>patch({enabled:e.target.checked})}/>{tr('เปิดใช้งานค่ายนี้สำหรับรายงาน','Enable this provider for reports')}</label>
   <label className={label}>{tr('API Key ของค่ายนี้','Provider API key')}<input type="password" autoComplete="off" spellCheck={false} value={c.key} disabled={off} onChange={e=>{patch({key:e.target.value,model:p==='gemini'?'auto':''});setModels([]);}} placeholder={p==='gemini'?tr('ว่าง = ใช้ Gemini Key หลัก','Blank = use main Gemini key'):'API key'} className="block w-full border rounded-lg p-2 mt-1"/></label>
   <a href={docs[p]} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-700 underline">{tr('วิธีรับ API Key / เว็บไซต์ผู้ให้บริการ','Get API key / provider website')}</a>
   <button type="button" disabled={off||!getKey(s,p)} onClick={()=>void load()} className="border rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-50">{tr('ตรวจการเข้าถึงและโหลดโมเดล','Check access and list models')}</button>
   <label className={label}>{tr('โมเดลที่อนุญาตให้ใช้','Approved model')}<select value={c.model} disabled={off} onChange={e=>patch({model:e.target.value})} className="block w-full border rounded-lg p-2 mt-1">
   <option value="">{p==='gemini'?tr('ใช้โมเดลจากการตั้งค่า Gemini หลัก','Inherit main Gemini model'):tr('เลือกโมเดลหลังโหลดรายชื่อ','Select after listing models')}</option>{p==='gemini'&&<option value="auto">{tr('Auto (Flash Lite / Flash)','Auto (Flash Lite / Flash)')}</option>}{[...new Set([...(c.model&&c.model!=='auto'?[c.model]:[]),...models])].map(model=><option key={model} value={model}>{model}</option>)}</select></label>
   <label className={label}>{tr('โหมดเลือก AI','Routing mode')}<select disabled={off} value={s.mode} onChange={e=>setS(old=>({...old,mode:e.target.value==='auto'?'auto':'manual'}))} className="block w-full border rounded-lg p-2 mt-1"><option value="manual">{tr('กำหนดเอง','Manual')}</option><option value="auto">{tr('Auto — ใช้ค่ายที่เปิดไว้','Auto — enabled providers')}</option></select></label>
   <label className={label}>{tr('ค่ายหลัก / ลำดับแรก','Primary / first provider')}<select disabled={off} value={s.primary} onChange={e=>setS(old=>({...old,primary:e.target.value as Provider}))} className="block w-full border rounded-lg p-2 mt-1">{providers.map(id=><option key={id} value={id}>{providerNames[id]}</option>)}</select></label>
   {s.mode==='auto'&&<label className="flex gap-2 items-start text-xs"><input type="checkbox" checked={s.fallback} disabled={off} onChange={e=>setS(old=>({...old,fallback:e.target.checked}))}/>{tr('อนุญาตให้ส่งข้อความรายงานไปยังค่ายสำรองที่เปิดไว้เมื่อค่ายก่อนหน้าตอบ 429 เท่านั้น อาจมีค่าใช้จ่ายตามโมเดลที่เลือก','Allow sending report text to enabled backup providers only after an upstream 429 rejection. Selected models may incur charges.')}</label>}
   <p className="text-xs text-slate-500">{tr('คีย์อยู่ในพื้นที่บัญชีของเบราว์เซอร์ ไม่รวมใน JSON/Drive ค่ายอื่นนอกจาก Gemini ส่งคีย์และข้อความผ่านเซิร์ฟเวอร์ของแอปชั่วคราวเพื่อเรียก API ไม่บันทึกคีย์บนเซิร์ฟเวอร์ OpenRouter อาจส่งข้อมูลต่อให้ผู้ให้บริการโมเดล','Keys stay in this browser account workspace, excluded from JSON/Drive. Non-Gemini requests pass key and text through the app server for the API call, without server-side key persistence. OpenRouter may route data to model providers.')}</p>
   <button type="button" disabled={off} onClick={()=>void save()} className="bg-indigo-700 text-white rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50">{tr('บันทึกการตั้งค่า AI','Save AI settings')}</button>
   {notice&&<p role="status" className="text-xs text-slate-700">{notice}</p>}
  </>}
 </div>;
}
