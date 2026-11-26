import React,{useEffect,useRef,useState} from 'react';
import App from '../App';
import { importLegacyAdminProjects } from '../utils/legacyAdminProjects';
import { PasswordChangeDialog } from './PasswordChangeDialog';
import { AdminLicensePanel } from './AdminLicensePanel';
import {openWorkspace,closeWorkspace,flushWorkspace,workspaceStatus} from '../utils/workspaceStorage';
const API='https://geleptwbxjoumxyxbhqa.supabase.co';
const PUBLIC_KEY="sb_publishable_v-AeQKI2OT9QRGVP1HVHbQ_STCiFAnk";
type Session={access_token:string;user:{id:string;email?:string}};
async function request<T>(path:string,token?:string,body?:unknown):Promise<T>{
 const headers:Record<string,string>={apikey:PUBLIC_KEY,'Content-Type':'application/json'};
 if(token)headers.Authorization='Bearer '+token;
 const res=await fetch(API+path,{method:body===undefined?'GET':'POST',headers,body:body===undefined?undefined:JSON.stringify(body),cache:'no-store',signal:AbortSignal.timeout(15000)});
 if(!res.ok)throw Error(res.status===429?'เรียกใช้งานบ่อยเกินไป กรุณาลองใหม่':'ยืนยันบัญชีหรือสิทธิ์ไม่สำเร็จ ('+res.status+')');
 return await res.json() as T;
}
async function allowed(token:string){return (await request<boolean>('/rest/v1/rpc/inspection_has_access',token,{}))===true;}
export default function AccountWorkspace(){
 const [session,setSession]=useState<Session|null>(null),[blocked,setBlocked]=useState(false),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[storage,setStorage]=useState(workspaceStatus);
 const [activationCode,setActivationCode]=useState('');
 const [legacyNotice,setLegacyNotice]=useState('');
 const [changePasswordOpen,setChangePasswordOpen]=useState(false);
 const resetUrl='https://teaminspectionproelite.github.io/INSPECTION-SERVICES/reset-password.html';
 const [isAdmin,setIsAdmin]=useState(false),[adminOpen,setAdminOpen]=useState(false);
 const live=useRef<Session|null>(null);
 useEffect(()=>{const listen=()=>setStorage(workspaceStatus());window.addEventListener('tis-workspace-storage',listen);return()=>window.removeEventListener('tis-workspace-storage',listen);},[]);
 async function login(e:React.FormEvent){
   e.preventDefault();if(busy)return;setBusy(true);setError('');
   try{
     const s=await request<Session>('/auth/v1/token?grant_type=password',undefined,{email:email.trim(),password});
     if(!s?.access_token||!s.user?.id)throw Error('ไม่พบข้อมูลบัญชี');
     if(activationCode.trim()){
       try{await request('/rest/v1/rpc/inspection_redeem_code',s.access_token,{p_code:activationCode.trim()});}
       catch{throw Error('เปิดใช้งานรหัสไม่สำเร็จ: ตรวจสอบว่ารหัสตรงกับบัญชีนี้ ยังไม่ถูกใช้ และไม่หมดอายุ หากเคยใช้แล้วให้เข้าสู่ระบบโดยไม่กรอกรหัส');}
       setActivationCode('');
     }
     if(!await allowed(s.access_token))throw Error('บัญชียังไม่ได้รับสิทธิ์ หรือสิทธิ์หมดอายุ/ถูกระงับ กรุณาติดต่อผู้ดูแลเพื่อรับรหัสลงทะเบียน');
     const admin = (await request<boolean>('/rest/v1/rpc/inspection_is_admin',s.access_token,{}))===true;
     await openWorkspace(s.user.id);
     if(admin){try{const count=await importLegacyAdminProjects(s.user.id,admin);if(count>0)setLegacyNotice('นำเข้าแฟ้มก่อนมีระบบ Login จำนวน '+count+' แฟ้ม เข้าพื้นที่ Admin แล้ว');}catch{setLegacyNotice('ยังนำเข้าแฟ้มเก่าไม่สำเร็จ ข้อมูลต้นฉบับยังอยู่ กรุณาสำรองข้อมูลหรือติดต่อผู้ดูแล');}}
     live.current=s;setSession(s);setBlocked(false);setIsAdmin(admin);setAdminOpen(false);
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
   if(busy)return;
   if(!window.confirm('ออกจากระบบ? โปรดบันทึกหมุดและงานร่างที่ยังไม่บันทึกก่อน'))return;
   setBusy(true);setError('');
   try{
     if(!await flushWorkspace())throw Error('ยังบันทึกข้อมูลไม่สำเร็จ โปรดสำรองข้อมูลลงเครื่องก่อน');
     const s=live.current;live.current=null;
     await closeWorkspace();
     if(s)try{await fetch(API+'/auth/v1/logout?scope=local',{method:'POST',headers:{apikey:PUBLIC_KEY,Authorization:'Bearer '+s.access_token},signal:AbortSignal.timeout(5000)});}catch{/* local session is closed */}
     // Reload the entire runtime so late async callbacks cannot write into a different account.
     window.location.reload();
   }catch(e){setError(e instanceof Error?e.message:'ออกจากระบบไม่สำเร็จ');}
   finally{setBusy(false);}
 }
 useEffect(()=>{
   if(!session)return;
   let running=false,disposed=false;
   const check=async()=>{if(running||disposed||live.current!==session)return;running=true;try{
     if(!await allowed(session.access_token))throw Error('สิทธิ์หมดอายุหรือถูกระงับ');
     const admin = (await request<boolean>('/rest/v1/rpc/inspection_is_admin',session.access_token,{}))===true;
     if(!disposed&&live.current===session){setIsAdmin(admin);if(!admin)setAdminOpen(false);}
   }catch{if(!disposed&&live.current===session){setIsAdmin(false);setAdminOpen(false);setBlocked(true);setError('ไม่สามารถยืนยันสิทธิ์ได้ กรุณาออกจากระบบและเข้าสู่ระบบใหม่');}}finally{running=false;}};
   const timer=window.setInterval(check,60000);
   const focus=()=>{if(document.visibilityState==='visible')void check();};
   document.addEventListener('visibilitychange',focus);
   return()=>{disposed=true;clearInterval(timer);document.removeEventListener('visibilitychange',focus);};
 },[session]);
 if(!session)return <main className="min-h-screen bg-slate-100 flex items-center justify-center p-4"><section className="bg-white border border-slate-200 rounded-2xl shadow-lg w-full max-w-md p-6 space-y-4">
 <h1 className="text-xl font-bold text-blue-950">TEAM INSPECTION PRO ELITE</h1><p className="text-sm text-slate-600">เข้าสู่ระบบเพื่อเปิดพื้นที่งานส่วนตัวบนอุปกรณ์นี้</p>
 <form onSubmit={login} className="space-y-3"><label className="block text-sm font-medium">อีเมล<input type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)} className="block w-full border rounded-lg p-2 mt-1"/></label>
 <label className="block text-sm font-medium">รหัสผ่าน<input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)} className="block w-full border rounded-lg p-2 mt-1"/></label>
 <details className="border border-slate-200 rounded-lg p-3"><summary className="cursor-pointer text-sm font-semibold text-blue-800">มีรหัสลงทะเบียน / ต่ออายุ License</summary><label className="block text-sm font-medium mt-3">รหัสลงทะเบียน<input autoComplete="off" spellCheck={false} value={activationCode} onChange={e=>setActivationCode(e.target.value)} placeholder="TIP-..." className="block w-full border rounded-lg p-2 mt-1"/></label><p className="text-xs text-slate-500 mt-2">กรอกเฉพาะครั้งแรกที่เปิดใช้งานหรือต่ออายุ รหัสใช้ได้ครั้งเดียวและผูกกับบัญชีของคุณ</p></details>
 <button disabled={busy} className="w-full bg-blue-800 text-white font-bold p-3 rounded-lg disabled:opacity-50">{busy?'กำลังตรวจสอบ…':'เข้าสู่ระบบ'}</button></form>
 <a href={resetUrl} className="block text-center text-sm text-blue-700 underline">ลืมรหัสผ่าน?</a>
 {error&&<p className="text-sm text-red-700" role="alert">{error}</p>}<p className="text-xs text-slate-500">ไฟล์งานเก็บในเบราว์เซอร์นี้เท่านั้น ไม่ซิงก์ระหว่างเครื่อง โปรดสำรอง JSON เป็นประจำ รูปที่กดวิเคราะห์จะส่งไปยัง Google Gemini เพื่อวิเคราะห์</p></section></main>;
 return <><div className="bg-slate-900 text-white px-4 py-2 flex flex-wrap items-center gap-3 text-xs"><span>{session.user.email} · พื้นที่งานส่วนตัว {isAdmin&&!blocked&&<strong className="ml-2 text-amber-300">Admin</strong>}</span>{isAdmin&&!blocked&&<button type="button" disabled={busy} onClick={()=>setAdminOpen(true)} className="bg-blue-600 hover:bg-blue-500 rounded-lg px-3 py-1.5 font-semibold">จัดการบัญชีลูกค้า / License</button>}<span className="ml-auto">{storage.failed?'บันทึกไม่สำเร็จ — สำรอง JSON':storage.pending?'กำลังบันทึก…':'ข้อมูลอยู่ในเครื่องนี้'}</span><button type="button" disabled={busy||blocked} onClick={()=>setChangePasswordOpen(true)} className="border rounded px-2 py-1">เปลี่ยนรหัสผ่าน</button><button disabled={busy} onClick={logout} className="border rounded px-2 py-1">ออกจากระบบ</button></div>
 {error&&<p role="alert" className="bg-red-100 text-red-900 p-3 text-sm">{error}</p>}
 {isAdmin&&!blocked&&legacyNotice&&<div role="status" className="bg-blue-50 text-blue-900 p-3 text-sm flex justify-between gap-3">{legacyNotice}<button type="button" onClick={()=>setLegacyNotice('')}>ปิด</button></div>}
 {storage.failed&&<p role="alert" className="bg-red-100 text-red-900 p-3 text-sm">บันทึก IndexedDB ไม่สำเร็จ กรุณาบันทึกเป็นไฟล์ JSON ก่อนปิดหน้า</p>}
 {blocked?<div className="p-6">ระงับการเปิดพื้นที่งานจนกว่าจะเข้าสู่ระบบใหม่</div>:<App key={session.user.id} isAdmin={isAdmin}/>}
 {changePasswordOpen&&!blocked&&<PasswordChangeDialog onChangePassword={changePassword} onClose={()=>setChangePasswordOpen(false)}/>}
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
