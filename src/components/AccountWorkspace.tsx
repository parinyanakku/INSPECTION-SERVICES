import React,{useEffect,useRef,useState} from 'react';
import App from '../App';
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
 const live=useRef<Session|null>(null);
 useEffect(()=>{const listen=()=>setStorage(workspaceStatus());window.addEventListener('tis-workspace-storage',listen);return()=>window.removeEventListener('tis-workspace-storage',listen);},[]);
 async function login(e:React.FormEvent){
   e.preventDefault();if(busy)return;setBusy(true);setError('');
   try{
     const s=await request<Session>('/auth/v1/token?grant_type=password',undefined,{email:email.trim(),password});
     if(!s?.access_token||!s.user?.id||!await allowed(s.access_token))throw Error('บัญชียังไม่ได้รับสิทธิ์ หรือสิทธิ์หมดอายุ/ถูกระงับ');
     await openWorkspace(s.user.id);
     live.current=s;setSession(s);setBlocked(false);
   }catch(e){setError(e instanceof Error?e.message:'เข้าสู่ระบบไม่สำเร็จ');}
   finally{setBusy(false);setPassword('');}
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
   }catch{if(!disposed&&live.current===session){setBlocked(true);setError('ไม่สามารถยืนยันสิทธิ์ได้ กรุณาออกจากระบบและเข้าสู่ระบบใหม่');}}finally{running=false;}};
   const timer=window.setInterval(check,60000);
   const focus=()=>{if(document.visibilityState==='visible')void check();};
   document.addEventListener('visibilitychange',focus);
   return()=>{disposed=true;clearInterval(timer);document.removeEventListener('visibilitychange',focus);};
 },[session]);
 if(!session)return <main className="min-h-screen bg-slate-100 flex items-center justify-center p-4"><section className="bg-white border border-slate-200 rounded-2xl shadow-lg w-full max-w-md p-6 space-y-4">
 <h1 className="text-xl font-bold text-blue-950">TEAM INSPECTION PRO ELITE</h1><p className="text-sm text-slate-600">เข้าสู่ระบบเพื่อเปิดพื้นที่งานส่วนตัวบนอุปกรณ์นี้</p>
 <form onSubmit={login} className="space-y-3"><label className="block text-sm font-medium">อีเมล<input type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)} className="block w-full border rounded-lg p-2 mt-1"/></label>
 <label className="block text-sm font-medium">รหัสผ่าน<input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)} className="block w-full border rounded-lg p-2 mt-1"/></label>
 <button disabled={busy} className="w-full bg-blue-800 text-white font-bold p-3 rounded-lg disabled:opacity-50">{busy?'กำลังตรวจสอบ…':'เข้าสู่ระบบ'}</button></form>
 {error&&<p className="text-sm text-red-700" role="alert">{error}</p>}<p className="text-xs text-slate-500">ไฟล์งานเก็บในเบราว์เซอร์นี้เท่านั้น ไม่ซิงก์ระหว่างเครื่อง โปรดสำรอง JSON เป็นประจำ รูปที่กดวิเคราะห์จะส่งไปยัง Google Gemini เพื่อวิเคราะห์</p></section></main>;
 return <><div className="bg-slate-900 text-white px-4 py-2 flex flex-wrap items-center gap-3 text-xs"><span>{session.user.email} · พื้นที่งานส่วนตัว</span><span className="ml-auto">{storage.failed?'บันทึกไม่สำเร็จ — สำรอง JSON':storage.pending?'กำลังบันทึก…':'ข้อมูลอยู่ในเครื่องนี้'}</span><button disabled={busy} onClick={logout} className="border rounded px-2 py-1">ออกจากระบบ</button></div>
 {error&&<p role="alert" className="bg-red-100 text-red-900 p-3 text-sm">{error}</p>}
 {storage.failed&&<p role="alert" className="bg-red-100 text-red-900 p-3 text-sm">บันทึก IndexedDB ไม่สำเร็จ กรุณาบันทึกเป็นไฟล์ JSON ก่อนปิดหน้า</p>}
 {blocked?<div className="p-6">ระงับการเปิดพื้นที่งานจนกว่าจะเข้าสู่ระบบใหม่</div>:<App key={session.user.id}/>}</>;
}
