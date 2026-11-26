import React,{useState} from 'react';
export function PasswordChangeDialog({onChangePassword,onClose}:{onChangePassword:(oldPassword:string,newPassword:string)=>Promise<void>;onClose:()=>void}){
 const [old,setOld]=useState(''),[next,setNext]=useState(''),[confirm,setConfirm]=useState(''),[show,setShow]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState(false);
 async function submit(e:React.FormEvent){e.preventDefault();if(busy)return;setError('');
 if(next.length<12||next.length>128||!/[A-Za-z]/.test(next)||!/[0-9]/.test(next)){setError('รหัสใหม่อย่างน้อย 12 ตัว มีตัวอักษรอังกฤษและตัวเลข');return;}
 if(next!==confirm){setError('รหัสผ่านใหม่ไม่ตรงกัน');return;}
 if(next===old){setError('กรุณาใช้รหัสผ่านใหม่ที่ต่างจากเดิม');return;}
 setBusy(true);try{await onChangePassword(old,next);setSuccess(true);}catch(e){setError(e instanceof Error?e.message:'เปลี่ยนรหัสผ่านไม่สำเร็จ');}finally{setOld('');setNext('');setConfirm('');setBusy(false);}
 }
 const cls='block w-full border border-slate-300 rounded-lg p-2 mt-1';
 return <div role="dialog" aria-modal="true" aria-labelledby="change-pw-title" className="fixed inset-0 z-[160] bg-slate-900/60 flex items-center justify-center p-4"><section className="bg-white rounded-2xl p-5 max-w-md w-full shadow-xl space-y-3">
 <h2 id="change-pw-title" className="font-bold text-lg">เปลี่ยนรหัสผ่าน</h2>
 {success?<><p role="status" className="text-emerald-700">เปลี่ยนรหัสผ่านสำเร็จ ครั้งถัดไปให้ใช้รหัสใหม่ โปรดบันทึกงานก่อนออกจากระบบ</p><button type="button" onClick={onClose} className="bg-blue-700 text-white rounded-lg p-2 w-full">ปิด</button></>:<form onSubmit={submit} className="space-y-3">
 <label className="block text-sm font-semibold">รหัสผ่านเดิม<input required type={show?'text':'password'} autoComplete="current-password" value={old} onChange={e=>setOld(e.target.value)} disabled={busy} className={cls}/></label>
 <label className="block text-sm font-semibold">รหัสผ่านใหม่<input required minLength={12} maxLength={128} type={show?'text':'password'} autoComplete="new-password" value={next} onChange={e=>setNext(e.target.value)} disabled={busy} className={cls}/></label>
 <label className="block text-sm font-semibold">ยืนยันรหัสผ่านใหม่<input required type={show?'text':'password'} autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)} disabled={busy} className={cls}/></label>
 <label className="flex gap-2 text-xs"><input type="checkbox" checked={show} onChange={e=>setShow(e.target.checked)}/>แสดงรหัสผ่าน</label>
 <p className="text-xs text-slate-500">อย่างน้อย 12 ตัว มีตัวอักษรอังกฤษและตัวเลข สิทธิ์ License และไฟล์งานจะไม่ถูกเปลี่ยน</p>
 {error&&<p role="alert" className="text-red-700 text-sm">{error}</p>}
 <div className="flex gap-2 justify-end"><button type="button" disabled={busy} onClick={onClose} className="border rounded-lg p-2">ยกเลิก</button><button disabled={busy} className="bg-blue-700 text-white rounded-lg p-2">{busy?'กำลังบันทึก…':'บันทึกรหัสผ่านใหม่'}</button></div></form>}
 </section></div>;
}
