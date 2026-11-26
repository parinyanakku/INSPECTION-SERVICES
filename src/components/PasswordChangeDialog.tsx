import type {AppLanguage} from '../types/inspection';
import {authMessage} from '../utils/uiLanguage';
import React,{useState} from 'react';
export function PasswordChangeDialog({lang,onChangePassword,onClose}:{lang:AppLanguage;onChangePassword:(oldPassword:string,newPassword:string)=>Promise<void>;onClose:()=>void}){
 const tr=(th:string,en:string)=>lang==='en'?en:th;
 const [old,setOld]=useState(''),[next,setNext]=useState(''),[confirm,setConfirm]=useState(''),[show,setShow]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState(false);
 async function submit(e:React.FormEvent){e.preventDefault();if(busy)return;setError('');
 if(next.length<12||next.length>128||!/[A-Za-z]/.test(next)||!/[0-9]/.test(next)){setError(tr("รหัสใหม่อย่างน้อย 12 ตัว มีตัวอักษรอังกฤษและตัวเลข","Use at least 12 characters with letters and numbers."));return;}
 if(next!==confirm){setError(tr("รหัสผ่านใหม่ไม่ตรงกัน","The new passwords do not match."));return;}
 if(next===old){setError(tr("กรุณาใช้รหัสผ่านใหม่ที่ต่างจากเดิม","Choose a different password."));return;}
 setBusy(true);try{await onChangePassword(old,next);setSuccess(true);}catch(e){setError(e instanceof Error?authMessage(e.message,lang):tr("เปลี่ยนรหัสผ่านไม่สำเร็จ","Password change failed."));}finally{setOld('');setNext('');setConfirm('');setBusy(false);}
 }
 const cls='block w-full border border-slate-300 rounded-lg p-2 mt-1';
 return <div role="dialog" aria-modal="true" aria-labelledby="change-pw-title" className="fixed inset-0 z-[160] bg-slate-900/60 flex items-center justify-center p-4"><section className="bg-white rounded-2xl p-5 max-w-md w-full shadow-xl space-y-3">
 <h2 id="change-pw-title" className="font-bold text-lg">{tr("เปลี่ยนรหัสผ่าน","Change password")}</h2>
 {success?<><p role="status" className="text-emerald-700">{tr("เปลี่ยนรหัสผ่านสำเร็จ ครั้งถัดไปให้ใช้รหัสใหม่ โปรดบันทึกงานก่อนออกจากระบบ","Password changed. Use the new password next time. Save your work before signing out.")}</p><button type="button" onClick={onClose} className="bg-blue-700 text-white rounded-lg p-2 w-full">{tr("ปิด","Close")}</button></>:<form onSubmit={submit} className="space-y-3">
 <label className="block text-sm font-semibold">{tr("รหัสผ่านเดิม","Current password")}<input required type={show?'text':'password'} autoComplete="current-password" value={old} onChange={e=>setOld(e.target.value)} disabled={busy} className={cls}/></label>
 <label className="block text-sm font-semibold">{tr("รหัสผ่านใหม่","New password")}<input required minLength={12} maxLength={128} type={show?'text':'password'} autoComplete="new-password" value={next} onChange={e=>setNext(e.target.value)} disabled={busy} className={cls}/></label>
 <label className="block text-sm font-semibold">{tr("ยืนยันรหัสผ่านใหม่","Confirm new password")}<input required type={show?'text':'password'} autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)} disabled={busy} className={cls}/></label>
 <label className="flex gap-2 text-xs"><input type="checkbox" checked={show} onChange={e=>setShow(e.target.checked)}/>{tr("แสดงรหัสผ่าน","Show password")}</label>
 <p className="text-xs text-slate-500">{tr("อย่างน้อย 12 ตัว มีตัวอักษรอังกฤษและตัวเลข สิทธิ์ License และไฟล์งานจะไม่ถูกเปลี่ยน","At least 12 characters, including letters and numbers. Your license and work files will not change.")}</p>
 {error&&<p role="alert" className="text-red-700 text-sm">{error}</p>}
 <div className="flex gap-2 justify-end"><button type="button" disabled={busy} onClick={onClose} className="border rounded-lg p-2">{tr("ยกเลิก","Cancel")}</button><button disabled={busy} className="bg-blue-700 text-white rounded-lg p-2">{busy?tr('กำลังบันทึก…','Saving…'):tr('บันทึกรหัสผ่านใหม่','Save new password')}</button></div></form>}
 </section></div>;
}
