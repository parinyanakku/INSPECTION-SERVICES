import { DriveSyncDialog,clearDriveSession } from './DriveSyncDialog';
import type {AppLanguage} from '../types/inspection';
import {readUiLanguage,saveUiLanguage,authMessage} from '../utils/uiLanguage';
import React,{useEffect,useRef,useState} from 'react';
import App from '../App';
import { importLegacyAdminProjects } from '../utils/legacyAdminProjects';
import { PasswordChangeDialog } from './PasswordChangeDialog';
import { AdminLicensePanel } from './AdminLicensePanel';
import {openWorkspace,closeWorkspace,flushWorkspace,workspaceStatus} from '../utils/workspaceStorage';
const API='https://geleptwbxjoumxyxbhqa.supabase.co';
const PUBLIC_KEY="sb_publishable_v-AeQKI2OT9QRGVP1HVHbQ_STCiFAnk";
type Session={access_token:string;refresh_token?:string;expires_at?:number;expires_in?:number;user:{id:string;email?:string}};
const SESSION_KEY='tis_auth_tab_session_v1';
function clearSession(){try{sessionStorage.removeItem(SESSION_KEY);}catch{}}
function remember(s:Session):Session{
 const expiry=s.expires_at||(s.expires_in?Math.floor(Date.now()/1000)+s.expires_in:0);
 const saved={...s,expires_at:expiry};
 if(saved.refresh_token&&expiry){try{sessionStorage.setItem(SESSION_KEY,JSON.stringify({access_token:saved.access_token,refresh_token:saved.refresh_token,expires_at:expiry,user:{id:saved.user.id,email:saved.user.email}}));}catch{}}
 return saved;
}
function readSession():Session|null{
 try{const s=JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null');return s&&typeof s.access_token==='string'&&typeof s.refresh_token==='string'&&Number.isFinite(s.expires_at)&&typeof s.user?.id==='string'?s:null;}catch{return null;}
}
async function refreshIfNeeded(s:Session):Promise<Session>{
 if(s.expires_at&&s.expires_at>Math.floor(Date.now()/1000)+120)return s;
 if(!s.refresh_token)throw Error('เซสชันหมดอายุ');
 const next=await request<Session>('/auth/v1/token?grant_type=refresh_token',undefined,{refresh_token:s.refresh_token});
 if(!next?.access_token||!next.refresh_token||next.user?.id!==s.user.id)throw Error('ยืนยันเซสชันไม่สำเร็จ');
 return remember(next);
}
async function request<T>(path:string,token?:string,body?:unknown):Promise<T>{
 const headers:Record<string,string>={apikey:PUBLIC_KEY,'Content-Type':'application/json'};
 if(token)headers.Authorization='Bearer '+token;
 const res=await fetch(API+path,{method:body===undefined?'GET':'POST',headers,body:body===undefined?undefined:JSON.stringify(body),cache:'no-store',signal:AbortSignal.timeout(15000)});
 if(!res.ok)throw Error(res.status===429?'เรียกใช้งานบ่อยเกินไป กรุณาลองใหม่':'ยืนยันบัญชีหรือสิทธิ์ไม่สำเร็จ ('+res.status+')');
 return await res.json() as T;
}
async function allowed(token:string){return (await request<boolean>('/rest/v1/rpc/inspection_has_access',token,{}))===true;}
export default function AccountWorkspace(){
 const [lang,setLang]=useState<AppLanguage>(readUiLanguage);
 const tr=(th:string,en:string)=>lang==='en'?en:th;
 const changeLang=(next:AppLanguage)=>{setLang(next);saveUiLanguage(next);};
 useEffect(()=>{document.documentElement.lang=lang;},[lang]);
 const [session,setSession]=useState<Session|null>(null),[blocked,setBlocked]=useState(false),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[storage,setStorage]=useState(workspaceStatus);
 const [activationCode,setActivationCode]=useState('');
 const [legacyNotice,setLegacyNotice]=useState('');
 const [changePasswordOpen,setChangePasswordOpen]=useState(false);
 const resetUrl='https://teaminspectionproelite.github.io/INSPECTION-SERVICES/reset-password.html';
 const [isAdmin,setIsAdmin]=useState(false),[adminOpen,setAdminOpen]=useState(false);
 const [driveOpen,setDriveOpen]=useState(false),[workspaceRevision,setWorkspaceRevision]=useState(0);
 const [driveBusy,setDriveBusy]=useState(false);
 const [mobileAccountMenu,setMobileAccountMenu]=useState(false);
 const autoRestoreSafe=useRef(false);
 const canAutoRestore=()=>autoRestoreSafe.current&&!adminOpen&&!changePasswordOpen&&!busy;
 useEffect(()=>{if(!session||blocked)clearDriveSession();return ()=>clearDriveSession();},[session?.user.id,blocked]);
 const live=useRef<Session|null>(null);
 const [restoring,setRestoring]=useState(()=>!!readSession());
 const restoreStarted=useRef(false),closing=useRef(false);
 const inFlight=useRef<Promise<void>|null>(null);
 async function enterWorkspace(s:Session){
   if(!await allowed(s.access_token)){clearSession();throw Error('บัญชียังไม่ได้รับสิทธิ์ หรือสิทธิ์หมดอายุ/ถูกระงับ กรุณาติดต่อผู้ดูแลเพื่อรับรหัสลงทะเบียน');}
   const admin=(await request<boolean>('/rest/v1/rpc/inspection_is_admin',s.access_token,{}))===true;
   await openWorkspace(s.user.id);
   if(admin){try{const count=await importLegacyAdminProjects(s.user.id,admin);if(count>0)setLegacyNotice('นำเข้าแฟ้มก่อนมีระบบ Login จำนวน '+count+' แฟ้ม เข้าพื้นที่ Admin แล้ว');}catch{setLegacyNotice('ยังนำเข้าแฟ้มเก่าไม่สำเร็จ ข้อมูลต้นฉบับยังอยู่ กรุณาสำรองข้อมูลหรือติดต่อผู้ดูแล');}}
   const saved=remember(s);live.current=saved;setSession(saved);setBlocked(false);setIsAdmin(admin);setAdminOpen(false);
 }
 useEffect(()=>{
   if(restoreStarted.current)return;restoreStarted.current=true;
   const saved=readSession();if(!saved){setRestoring(false);return;}
   void (async()=>{
     try{
       const current=await refreshIfNeeded(saved);
       const verified=await request<Session['user']>('/auth/v1/user',current.access_token);
       if(verified.id!==saved.user.id){clearSession();throw Error('บัญชีไม่ตรงกับเซสชันเดิม');}
       await enterWorkspace({...current,user:verified});
     }catch(e){setError(e instanceof Error?e.message:'ไม่สามารถคืนสถานะเข้าสู่ระบบได้ กรุณาเข้าสู่ระบบใหม่');}
     finally{setRestoring(false);}
   })();
 },[]);
 useEffect(()=>{const listen=()=>setStorage(workspaceStatus());window.addEventListener('tis-workspace-storage',listen);return()=>window.removeEventListener('tis-workspace-storage',listen);},[]);
 async function login(e:React.FormEvent){
   e.preventDefault();if(busy||restoring)return;setBusy(true);setError('');clearSession();
   try{
     const s=await request<Session>('/auth/v1/token?grant_type=password',undefined,{email:email.trim(),password});
     if(!s?.access_token||!s.user?.id)throw Error('ไม่พบข้อมูลบัญชี');
     if(activationCode.trim()){
       try{await request('/rest/v1/rpc/inspection_redeem_code',s.access_token,{p_code:activationCode.trim()});}
       catch{throw Error('เปิดใช้งานรหัสไม่สำเร็จ: ตรวจสอบว่ารหัสตรงกับบัญชีนี้ ยังไม่ถูกใช้ และไม่หมดอายุ หากเคยใช้แล้วให้เข้าสู่ระบบโดยไม่กรอกรหัส');}
       setActivationCode('');
     }
     await enterWorkspace(s);
   }catch(e){setError(e instanceof Error?e.message:'เข้าสู่ระบบไม่สำเร็จ');}
   finally{setBusy(false);setPassword('');}
 }
 async function changePassword(oldPassword:string,newPassword:string){
   const current=live.current;
   if(!current?.user.email)throw Error('กรุณาเข้าสู่ระบบใหม่');
   const fresh=await request<Session>('/auth/v1/token?grant_type=password',undefined,{email:current.user.email,password:oldPassword});
   if(!fresh?.access_token||fresh.user?.id!==current.user.id||live.current!==current)throw Error('ยืนยันรหัสผ่านเดิมไม่สำเร็จ');
   try{
     const response=await fetch(API+'/auth/v1/user',{method:'PUT',headers:{apikey:PUBLIC_KEY,Authorization:'Bearer '+fresh.access_token,'Content-Type':'application/json'},body:JSON.stringify({password:newPassword}),cache:'no-store',signal:AbortSignal.timeout(15000)});
     if(!response.ok)throw Error('เปลี่ยนรหัสผ่านไม่สำเร็จ กรุณาตรวจสอบเงื่อนไขรหัสผ่านแล้วลองใหม่');
   }finally{
     // Revoke only the additional reauthentication session; do not reload or discard the workspace.
     try{await fetch(API+'/auth/v1/logout?scope=local',{method:'POST',headers:{apikey:PUBLIC_KEY,Authorization:'Bearer '+fresh.access_token},signal:AbortSignal.timeout(5000)});}catch{}
   }
 }
 async function logout(){
   if(busy||driveBusy)return;
   if(!window.confirm(authMessage('ออกจากระบบ? โปรดบันทึกหมุดและงานร่างที่ยังไม่บันทึกก่อน',lang)))return;
   clearDriveSession();setBusy(true);setError('');closing.current=true;
   try{
     await inFlight.current;
     if(!await flushWorkspace())throw Error('ยังบันทึกข้อมูลไม่สำเร็จ โปรดสำรองข้อมูลลงเครื่องก่อน');
     const s=live.current;
     await closeWorkspace();
     clearSession();live.current=null;
     if(s)try{await fetch(API+'/auth/v1/logout?scope=local',{method:'POST',headers:{apikey:PUBLIC_KEY,Authorization:'Bearer '+s.access_token},signal:AbortSignal.timeout(5000)});}catch{/* local session is closed */}
     // Reload the entire runtime so late async callbacks cannot write into a different account.
     window.location.reload();
   }catch(e){setError(e instanceof Error?e.message:'ออกจากระบบไม่สำเร็จ');}
   finally{closing.current=false;setBusy(false);}
 }
 useEffect(()=>{
   if(!session)return;
   let disposed=false;
   const check=()=>{
     if(inFlight.current||disposed||closing.current||!live.current)return;
     const initial=live.current;
     const task=(async()=>{try{
       const current=await refreshIfNeeded(initial);
       if(disposed||live.current!==initial)return;
       live.current=current;
       if(current!==initial)setSession(current);
       if(!await allowed(current.access_token)){clearSession();throw Error('สิทธิ์หมดอายุหรือถูกระงับ');}
       const admin=(await request<boolean>('/rest/v1/rpc/inspection_is_admin',current.access_token,{}))===true;
       if(!disposed&&!closing.current){setIsAdmin(admin);if(!admin)setAdminOpen(false);}
     }catch{
       if(!disposed&&!closing.current){setIsAdmin(false);setAdminOpen(false);setBlocked(true);setError('ไม่สามารถยืนยันสิทธิ์ได้ กรุณารีเฟรชเพื่อเชื่อมต่อใหม่ หรือออกจากระบบแล้วเข้าสู่ระบบอีกครั้ง');}
     }})();
     inFlight.current=task;void task.finally(()=>{if(inFlight.current===task)inFlight.current=null;});
   };
   const timer=window.setInterval(check,60000);
   const focus=()=>{if(document.visibilityState==='visible')check();};
   document.addEventListener('visibilitychange',focus);
   return()=>{disposed=true;clearInterval(timer);document.removeEventListener('visibilitychange',focus);};
 },[session?.user.id]);
 if(restoring)return <main className="min-h-screen bg-slate-100 flex items-center justify-center p-4"><section className="bg-white rounded-xl border p-6 text-center"><h1 className="font-bold text-blue-950">TEAM INSPECTION PRO ELITE</h1><p role="status" className="text-sm text-slate-600 mt-3">{tr("กำลังตรวจสอบบัญชีและเปิดแฟ้มงานเดิม…","Verifying your account and opening your workspace…")}</p></section></main>;
 if(!session)return <main className="min-h-screen bg-slate-100 flex items-center justify-center p-4"><section className="bg-white border border-slate-200 rounded-2xl shadow-lg w-full max-w-md p-6 space-y-4">
 <div className="flex justify-end gap-1" role="group" aria-label={tr('ภาษา','Language')}>{(['th','en'] as const).map(code=><button key={code} type="button" aria-pressed={lang===code} onClick={()=>changeLang(code)} className={'rounded-lg border px-3 py-1.5 text-xs font-bold '+(lang===code?'bg-blue-800 text-white border-blue-800':'bg-white text-slate-600 border-slate-300')}>{code==='th'?'ไทย · TH':'EN · English'}</button>)}</div>
 <h1 className="text-xl font-bold text-blue-950">TEAM INSPECTION PRO ELITE</h1><p className="text-sm text-slate-600">{tr("เข้าสู่ระบบเพื่อเปิดพื้นที่งานส่วนตัวบนอุปกรณ์นี้","Sign in to open your private workspace on this device.")}</p>
 <form onSubmit={login} className="space-y-3"><label className="block text-sm font-medium">{tr("อีเมล","Email")}<input type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)} className="block w-full border rounded-lg p-2 mt-1"/></label>
 <label className="block text-sm font-medium">{tr("รหัสผ่าน","Password")}<input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)} className="block w-full border rounded-lg p-2 mt-1"/></label>
 <details className="border border-slate-200 rounded-lg p-3"><summary className="cursor-pointer text-sm font-semibold text-blue-800">{tr("มีรหัสลงทะเบียน / ต่ออายุ License","Have an activation / renewal code?")}</summary><label className="block text-sm font-medium mt-3">{tr("รหัสลงทะเบียน","License code")}<input autoComplete="off" spellCheck={false} value={activationCode} onChange={e=>setActivationCode(e.target.value)} placeholder="TIP-..." className="block w-full border rounded-lg p-2 mt-1"/></label><p className="text-xs text-slate-500 mt-2">{tr("กรอกเฉพาะครั้งแรกที่เปิดใช้งานหรือต่ออายุ รหัสใช้ได้ครั้งเดียวและผูกกับบัญชีของคุณ","Enter a code only when activating or renewing. Each code is single-use and linked to your account.")}</p></details>
 <button disabled={busy} className="w-full bg-blue-800 text-white font-bold p-3 rounded-lg disabled:opacity-50">{busy?tr('กำลังตรวจสอบ…','Verifying…'):tr('เข้าสู่ระบบ','Sign in')}</button></form>
 <a href={resetUrl} className="block text-center text-sm text-blue-700 underline">{tr("ลืมรหัสผ่าน?","Forgot password?")}</a>
 {error&&<p className="text-sm text-red-700" role="alert">{authMessage(error,lang)}</p>}<p className="text-xs text-slate-500">{tr("ไฟล์งานบันทึกในเครื่อง เปิดซิงค์ Google Drive ด้วยบัญชีเดียวกันบนคอมและมือถือเพื่อใช้ข้อมูลร่วมกัน รูปที่กดวิเคราะห์จะส่งไปยัง Google Gemini เพื่อวิเคราะห์","Work is saved on this device. Connect Google Drive with the same accounts on both devices to sync it. Photos selected for analysis are sent to Google Gemini.")}</p></section></main>;
 return <><div className="bg-slate-900 text-white px-3 sm:px-4 py-2 flex flex-wrap items-center gap-1.5 sm:gap-3 text-xs"><div className="flex w-full items-start justify-between gap-2 sm:contents"><span className="min-w-0 break-all flex-1 sm:flex-initial">{session.user.email} · {tr('พื้นที่งานส่วนตัว','Private workspace')} {isAdmin&&!blocked&&<strong className="ml-2 text-amber-300">Admin</strong>}</span><div className="shrink-0 inline-flex rounded-md border border-slate-500 p-0.5 gap-0.5 sm:order-last sm:ml-auto" data-tour="language-switch" role="group" aria-label={tr('เปลี่ยนภาษา','Change language')}>{(['th','en'] as const).map(code=><button key={code} type="button" lang={code} aria-label={code==='th'?'ภาษาไทย':'English'} aria-pressed={lang===code} onClick={()=>changeLang(code)} className={'min-h-8 px-2.5 rounded text-xs font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300 '+(lang===code?'bg-white text-slate-900':'text-slate-200 hover:bg-slate-700')}>{code.toUpperCase()}</button>)}</div></div><button type="button" aria-expanded={mobileAccountMenu} onClick={()=>setMobileAccountMenu(v=>!v)} className="sm:hidden rounded border px-2.5 py-2 text-xs">{tr("บัญชี / เมนู","Account / menu")} {mobileAccountMenu?"▴":"▾"}</button>{isAdmin&&!blocked&&<button type="button" disabled={busy} onClick={()=>setAdminOpen(true)} className={`${mobileAccountMenu?"inline-flex":"hidden"} sm:inline-flex order-last sm:order-none bg-blue-600 hover:bg-blue-500 rounded-lg px-3 py-1.5 font-semibold`}>{tr("จัดการบัญชีลูกค้า / License","Manage customers / licenses")}</button>}{!blocked&&<button data-tour="drive" type="button" disabled={busy} onClick={()=>setDriveOpen(true)} className="border rounded px-2.5 py-2 sm:py-1">{tr('ซิงค์ Google Drive','Google Drive sync')}</button>}<span className="ml-auto text-[11px] sm:text-xs">{storage.failed?tr('บันทึกไม่สำเร็จ — สำรอง JSON','Save failed — export JSON'):storage.pending?tr('กำลังบันทึก…','Saving…'):tr('ข้อมูลอยู่ในเครื่องนี้','Data stored on this device')}</span><button type="button" disabled={busy||blocked} onClick={()=>setChangePasswordOpen(true)} className={`${mobileAccountMenu?"inline-flex":"hidden"} sm:inline-flex order-last sm:order-none border rounded px-2 py-1.5`}>{tr("เปลี่ยนรหัสผ่าน","Change password")}</button><button disabled={busy||driveBusy} onClick={logout} className={`${mobileAccountMenu?"inline-flex":"hidden"} sm:inline-flex order-last sm:order-none border rounded px-2 py-1.5`}>{tr("ออกจากระบบ","Sign out")}</button></div>
 {error&&<p role="alert" className="bg-red-100 text-red-900 p-3 text-sm">{authMessage(error,lang)}</p>}
 {isAdmin&&!blocked&&legacyNotice&&<div role="status" className="bg-blue-50 text-blue-900 p-3 text-sm flex justify-between gap-3">{lang==='en'?(legacyNotice.match(/\d+/)?'Imported '+legacyNotice.match(/\d+/)?.[0]+' legacy projects into your admin workspace.':'Legacy import could not be completed. Original data is preserved.'):legacyNotice}<button type="button" onClick={()=>setLegacyNotice('')}>{tr("ปิด","Close")}</button></div>}
 {storage.failed&&<p role="alert" className="bg-red-100 text-red-900 p-3 text-sm">{tr("บันทึก IndexedDB ไม่สำเร็จ กรุณาบันทึกเป็นไฟล์ JSON ก่อนปิดหน้า","Local storage failed. Export a JSON backup before closing.")}</p>}
 {!blocked&&<DriveSyncDialog key={session.user.id} userId={session.user.id} lang={lang} visible={driveOpen} paused={busy||adminOpen||changePasswordOpen} canAutoRestore={canAutoRestore} onOpen={()=>setDriveOpen(true)} onBusyChange={setDriveBusy} onClose={()=>setDriveOpen(false)} onRestored={()=>{setWorkspaceRevision(v=>v+1);}}/>}
 {blocked?<div className="p-6">{tr("ระงับการเปิดพื้นที่งานจนกว่าจะเข้าสู่ระบบใหม่","Workspace access is suspended until you sign in again.")}</div>:<App key={session.user.id+':'+workspaceRevision} isAdmin={isAdmin} language={lang} onLanguageChange={changeLang} autoRestoreSafe={autoRestoreSafe} onOpenDrive={()=>setDriveOpen(true)}/>}

 {changePasswordOpen&&!blocked&&<PasswordChangeDialog lang={lang} onChangePassword={changePassword} onClose={()=>setChangePasswordOpen(false)}/>}
 {adminOpen&&isAdmin&&!blocked&&<AdminLicensePanel key={session.user.id} rpc={(name,body={})=>request('/rest/v1/rpc/'+name,session.access_token,body)} createCustomer={async body=>{
   const r=await fetch(API+'/functions/v1/inspection-create-customer',{method:'POST',headers:{apikey:PUBLIC_KEY,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store',signal:AbortSignal.timeout(35000)});
   if(!r.ok)throw Error(r.status===409?'อีเมลนี้มีบัญชีอยู่แล้วหรือข้อมูลไม่ถูกต้อง':r.status===401||r.status===403?'ไม่มีสิทธิ์สร้างบัญชี กรุณาเข้าสู่ระบบใหม่':r.status===400?'ตรวจสอบชื่อ อีเมล และรหัสผ่าน':'สร้างบัญชีไม่สำเร็จ กรุณารีเฟรชรายชื่อก่อนลองใหม่');
   return await r.json();
 }} deleteCustomer={async body=>{
 const r=await fetch(API+'/functions/v1/inspection-delete-customer',{method:'POST',headers:{apikey:PUBLIC_KEY,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store',signal:AbortSignal.timeout(40000)});
 const data=await r.json().catch(()=>({}));
 if(!r.ok||data.deleted!==true)throw Error(data.access_revoked?'ระงับสิทธิ์แล้ว แต่ยังยืนยันการลบไม่ได้ กรุณารีเฟรชรายชื่อก่อนลองใหม่':r.status===401||r.status===403?'ไม่มีสิทธิ์ลบบัญชี':r.status===409?'บัญชีหรืออีเมลยืนยันไม่ตรงกัน กรุณารีเฟรช':'ยังยืนยันการลบไม่ได้ กรุณารีเฟรชรายชื่อก่อนลองใหม่');
 }} onClose={()=>setAdminOpen(false)}/>}
 </>;
}
