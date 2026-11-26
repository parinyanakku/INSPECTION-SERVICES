import React,{useEffect,useRef,useState} from 'react';

type Plan='trial'|'monthly'|'yearly'|'lifetime'|'custom';
type Account={user_id:string;email:string|null;display_name:string|null;role:string;plan:Plan|null;active:boolean;expires_at:string|null;last_sign_in_at:string|null};
type Edit={display_name:string;plan:Plan;active:boolean;expires_at:string};
type Rpc=(name:string,body?:unknown)=>Promise<unknown>;
type IssuedCode={code:string;redeem_by:string;plan:Plan;duration_days:number|null};
const daysFor=(plan:Plan)=>({trial:7,monthly:30,yearly:365,lifetime:0,custom:30}[plan]);
const plans:Record<Plan,string>={trial:'ทดลองใช้ 7 วัน',monthly:'รายเดือน',yearly:'รายปี',lifetime:'ตลอดชีพ',custom:'กำหนดเอง'};
function localDate(value:string|null){if(!value)return '';const d=new Date(value);if(!Number.isFinite(d.getTime()))return '';const p=(n:number)=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+'T'+p(d.getHours())+':'+p(d.getMinutes());}
function expiry(plan:Plan){if(plan==='lifetime')return '';const d=new Date();d.setDate(d.getDate()+({trial:7,monthly:30,yearly:365,custom:30,lifetime:0}[plan]));return localDate(d.toISOString());}
function initial(u:Account):Edit{const plan=u.plan||'trial';return {display_name:u.display_name||'',plan,active:!!u.active,expires_at:localDate(u.expires_at)||expiry(plan)};}
function state(u:Account){return !u.plan?'ยังไม่ได้รับสิทธิ์':!u.active?'ระงับสิทธิ์':u.expires_at&&Date.parse(u.expires_at)<=Date.now()?'หมดอายุ':'ใช้งานได้';}
type DeleteCustomer=(input:{user_id:string;confirm_email:string})=>Promise<void>;
function AccountRow({u,rpc,onSaved,onDeleted,deleteCustomer}:{u:Account;rpc:Rpc;onSaved:()=>Promise<void>;onDeleted:()=>Promise<void>;deleteCustomer:DeleteCustomer}){
 const [edit,setEdit]=useState(()=>initial(u)),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{setEdit(initial(u));},[u]);
 const [issued,setIssued]=useState<IssuedCode|null>(null),[days,setDays]=useState(()=>daysFor(u.plan||'trial')),[codeMessage,setCodeMessage]=useState('');
 const readOnly=u.role==='admin';
 const [deleteOpen,setDeleteOpen]=useState(false),[confirmEmail,setConfirmEmail]=useState(''),[deleteError,setDeleteError]=useState('');
 async function removeAccount(){
   if(readOnly||busy||!u.email||confirmEmail.trim().toLowerCase()!==u.email.toLowerCase())return;
   setBusy(true);setDeleteError('');
   try{await deleteCustomer({user_id:u.user_id,confirm_email:confirmEmail.trim()});setDeleteOpen(false);await onDeleted();}
   catch(e){setDeleteError(e instanceof Error?e.message:'ไม่สามารถยืนยันการลบได้ กรุณารีเฟรชรายชื่อก่อนลองใหม่');}finally{setBusy(false);}
 }
 async function issue(){
   if(readOnly||busy)return;
   if(edit.plan!=='lifetime'&&(!Number.isInteger(days)||days<1||days>3650)){setError('ระบุจำนวนวัน 1–3650 วัน');return;}
   if(!window.confirm('สร้างรหัสสำหรับ '+(u.email||u.user_id)+'? รหัสที่ยังไม่ได้ใช้ก่อนหน้านี้จะถูกยกเลิก และเมื่อเปิดใช้งานจะเปลี่ยนสิทธิ์เป็นแพ็กเกจที่เลือก'))return;
   setBusy(true);setError('');setCodeMessage('');setIssued(null);
   try{
     const data=await rpc('inspection_admin_issue_code',{p_user_id:u.user_id,p_plan:edit.plan,p_duration_days:edit.plan==='lifetime'?null:days}) as IssuedCode;
     if(!data?.code||!data.redeem_by)throw Error('ไม่พบรหัสที่สร้าง');
     setIssued(data);
   }catch(e){setError(e instanceof Error?e.message:'สร้างรหัสไม่สำเร็จ');}finally{setBusy(false);}
 }
 async function revoke(){
   if(readOnly||busy||!window.confirm('ยกเลิกรหัสลงทะเบียนที่ยังไม่ได้ใช้ของบัญชีนี้ทั้งหมดหรือไม่? สิทธิ์ที่เปิดใช้งานแล้วจะไม่ถูกเปลี่ยน'))return;
   setBusy(true);setError('');setCodeMessage('');
   try{const n=await rpc('inspection_admin_revoke_codes',{p_user_id:u.user_id});setIssued(null);setCodeMessage('ยกเลิกรหัสที่ยังไม่ใช้ '+String(n)+' รายการ');}
   catch(e){setError(e instanceof Error?e.message:'ยกเลิกรหัสไม่สำเร็จ');}finally{setBusy(false);}
 }
 const instructions=issued?[
   'TEAM INSPECTION PRO ELITE — รหัสลงทะเบียน',
   'บัญชี: '+(u.email||''),
   'รหัส: '+issued.code,
   'สิทธิ์: '+plans[issued.plan]+(issued.duration_days?' ('+issued.duration_days+' วันนับจากเปิดใช้งาน)':''),
   'ใช้รหัสก่อน: '+new Date(issued.redeem_by).toLocaleString('th-TH'),
   'เว็บไซต์: https://teaminspectionproelite.github.io/INSPECTION-SERVICES/auth-preview.html',
   'เข้าสู่ระบบด้วยบัญชีของคุณ เปิดหัวข้อ มีรหัสลงทะเบียน / ต่ออายุ License แล้ววางรหัส กดเข้าสู่ระบบ รหัสใช้ได้ครั้งเดียว'
 ].join('\n'):'';
 async function copy(){try{await navigator.clipboard.writeText(instructions);setCodeMessage('คัดลอกข้อความสำหรับส่งลูกค้าแล้ว');}catch{setCodeMessage('คัดลอกอัตโนมัติไม่ได้ กรุณาเลือกข้อความแล้วคัดลอกเอง');}}

 async function save(){
  if(readOnly||busy)return;setBusy(true);setError('');
  try{
   const d=edit.plan==='lifetime'?null:new Date(edit.expires_at);
   if(d&&!Number.isFinite(d.getTime()))throw Error('กรุณาระบุวันหมดอายุ');
   if(edit.active&&d&&d.getTime()<=Date.now()&&!window.confirm('วันหมดอายุผ่านไปแล้ว ยืนยันบันทึกหรือไม่?'))return;
   await rpc('inspection_admin_set_license',{p_user_id:u.user_id,p_display_name:edit.display_name.trim(),p_plan:edit.plan,p_active:edit.active,p_expires_at:d?d.toISOString():null});
   await onSaved();
  }catch(e){setError(e instanceof Error?e.message:'บันทึกไม่สำเร็จ');}finally{setBusy(false);}
 }
 const inputClass='border border-slate-300 rounded-lg px-2 py-1.5 text-sm w-full disabled:bg-slate-100';
 return <tr className="border-b border-slate-200 align-top">
 <td className="p-3 min-w-[220px]"><div className="font-medium break-all">{u.email||u.user_id}</div><input aria-label="ชื่อผู้ใช้" className={inputClass+' mt-1'} value={edit.display_name} disabled={readOnly||busy} onChange={e=>setEdit(p=>({...p,display_name:e.target.value}))}/><div className="text-xs text-slate-500 mt-1">เข้าใช้ล่าสุด: {u.last_sign_in_at?new Date(u.last_sign_in_at).toLocaleString('th-TH'):'—'}</div></td>
 <td className="p-3 whitespace-nowrap"><div>{readOnly?'ผู้ดูแลระบบ':'ลูกค้า'}</div><div className="text-xs text-slate-500">{state(u)}</div></td>
 <td className="p-3 min-w-[160px]"><select aria-label="แพ็กเกจ" className={inputClass} disabled={readOnly||busy} value={edit.plan} onChange={e=>{const plan=e.target.value as Plan;setEdit(p=>({...p,plan,expires_at:expiry(plan)}));setDays(daysFor(plan));}}>{Object.entries(plans).map(([p,label])=><option key={p} value={p}>{label}</option>)}</select></td>
 <td className="p-3 min-w-[205px]"><input aria-label="วันหมดอายุ" type="datetime-local" className={inputClass} value={edit.expires_at} disabled={readOnly||busy||edit.plan==='lifetime'} onChange={e=>setEdit(p=>({...p,expires_at:e.target.value}))}/></td>
 <td className="p-3"><label className="flex gap-2 items-center whitespace-nowrap"><input type="checkbox" checked={edit.active} disabled={readOnly||busy} onChange={e=>setEdit(p=>({...p,active:e.target.checked}))}/>เปิดใช้งาน</label></td>
 <td className="p-3 min-w-[110px]"><button type="button" disabled={readOnly||busy} onClick={save} className="bg-blue-700 text-white rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-40">{readOnly?'Admin':busy?'กำลังบันทึก':'บันทึกสิทธิ์'}</button>{!readOnly&&<div className="space-y-2 mt-3">
 {edit.plan!=='lifetime'&&<label className="block text-xs">จำนวนวันสำหรับรหัส<input type="number" min="1" max="3650" step="1" aria-label="จำนวนวันสำหรับรหัส" disabled={busy} value={days} onChange={e=>setDays(Number(e.target.value))} className={inputClass}/></label>}
 <button type="button" disabled={busy} onClick={issue} className="block bg-emerald-700 text-white rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-40">สร้างรหัส License</button>
 <button type="button" disabled={busy} onClick={revoke} className="block border border-red-200 text-red-700 rounded-lg px-3 py-2 text-xs">ยกเลิกรหัสที่ยังไม่ใช้</button>
 <button type="button" disabled={busy||!u.email} onClick={()=>{setConfirmEmail('');setDeleteError('');setDeleteOpen(true);}} className="block bg-red-700 hover:bg-red-800 text-white rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-40">ลบผู้ใช้</button>
 </div>}
 {issued&&<div className="fixed inset-0 z-[150] bg-slate-900/60 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="รหัสลงทะเบียนที่สร้าง"><div className="bg-white rounded-2xl p-5 max-w-lg w-full space-y-3 shadow-xl"><h3 className="font-bold text-lg">รหัสลงทะเบียนลูกค้า</h3><p className="text-xs text-slate-600">แสดงรหัสนี้ครั้งเดียว กรุณาคัดลอกก่อนปิด รหัสใช้ได้ 7 วันสำหรับเปิดใช้งาน</p><textarea readOnly rows={9} value={instructions} className="border rounded-lg p-2 w-full text-xs"/><div className="flex gap-2"><button type="button" onClick={copy} className="bg-blue-700 text-white px-3 py-2 rounded-lg">คัดลอกข้อความส่งลูกค้า</button><button type="button" onClick={()=>{if(window.confirm('ปิดรหัสนี้? จะไม่สามารถเรียกดูรหัสเดิมได้อีก'))setIssued(null);}} className="border rounded-lg px-3 py-2">ปิด</button></div>{codeMessage&&<p role="status" className="text-xs text-emerald-700">{codeMessage}</p>}</div></div>}
 {deleteOpen&&<div className="fixed inset-0 z-[160] bg-slate-900/65 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="ยืนยันการลบผู้ใช้"><div className="bg-white rounded-2xl p-5 max-w-md w-full space-y-3 shadow-xl">
 <h3 className="font-bold text-lg text-red-700">ยืนยันการลบผู้ใช้ถาวร</h3>
 <p className="text-sm break-all">บัญชี: <strong>{u.email}</strong></p>
 <p className="text-sm text-slate-600">บัญชีและสิทธิ์ License จะถูกลบ รหัสที่ยังไม่ใช้จะถูกยกเลิก และไม่สามารถกู้คืนบัญชีเดิมได้ ไฟล์งานในเครื่องลูกค้าจะไม่ถูกลบ แต่บัญชีใหม่จะไม่สามารถเปิดพื้นที่บัญชีเดิมโดยอัตโนมัติ ควรให้ลูกค้าสำรองไฟล์ก่อนลบ หากต้องการหยุดใช้งานชั่วคราวให้ระงับสิทธิ์แทน</p>
 <label className="block text-sm font-semibold">พิมพ์อีเมลของบัญชีเพื่อยืนยัน<input autoComplete="off" value={confirmEmail} disabled={busy} onChange={e=>setConfirmEmail(e.target.value)} className={inputClass+' mt-1'}/></label>
 {deleteError&&<p role="alert" className="text-sm text-red-700">{deleteError}</p>}
 <div className="flex justify-end gap-2"><button type="button" disabled={busy} onClick={()=>setDeleteOpen(false)} className="border rounded-lg px-3 py-2">ยกเลิก</button><button type="button" disabled={busy||!u.email||confirmEmail.trim().toLowerCase()!==u.email.toLowerCase()} onClick={()=>void removeAccount()} className="bg-red-700 text-white rounded-lg px-3 py-2 font-semibold disabled:opacity-40">{busy?'กำลังลบ…':'ยืนยันลบผู้ใช้'}</button></div>
 </div></div>}
 {!issued&&codeMessage&&<p role="status" className="text-xs text-emerald-700 mt-1">{codeMessage}</p>}
 {error&&<p role="alert" className="text-xs text-red-700 mt-1">{error}</p>}</td>
 </tr>;
}
type CustomerInput={email:string;display_name:string;password:string};
type CreateResult={user_id:string;email:string;license_initialized:boolean};
export function AdminLicensePanel({rpc,onClose,createCustomer,deleteCustomer}:{rpc:Rpc;onClose:()=>void;createCustomer:(input:CustomerInput)=>Promise<CreateResult>;deleteCustomer:DeleteCustomer}){
 const [createOpen,setCreateOpen]=useState(false),[createBusy,setCreateBusy]=useState(false);
 const [customerName,setCustomerName]=useState(''),[customerEmail,setCustomerEmail]=useState(''),[customerPassword,setCustomerPassword]=useState(''),[showPassword,setShowPassword]=useState(false),[createError,setCreateError]=useState('');
 function closeCreate(){if(createBusy)return;setCreateOpen(false);setCustomerPassword('');setShowPassword(false);setCreateError('');}
 function generatePassword(){const bytes=crypto.getRandomValues(new Uint8Array(18));setCustomerPassword('Aa7!'+Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join(''));setShowPassword(true);}
 async function submitCustomer(e:React.FormEvent){
   e.preventDefault();if(createBusy)return;
   const email=customerEmail.trim().toLowerCase(),name=customerName.trim();
   if(!name||!email||customerPassword.length<12||!/[A-Za-z]/.test(customerPassword)||!/[0-9]/.test(customerPassword)){setCreateError('กรุณากรอกข้อมูลครบถ้วน รหัสผ่านอย่างน้อย 12 ตัว มีตัวอักษรอังกฤษและตัวเลข');return;}
   setCreateBusy(true);setCreateError('');
   try{
     const result=await createCustomer({email,display_name:name,password:customerPassword});
     if(!result?.user_id)throw Error('ไม่พบผลยืนยัน กรุณารีเฟรชรายชื่อก่อนลองใหม่');
     setCustomerPassword('');setShowPassword(false);setCustomerName('');setCustomerEmail('');setCreateOpen(false);setQuery('');
     await load();if(alive.current)setMessage(result.license_initialized?'สร้างบัญชี '+email+' สำเร็จ — ยังไม่มีสิทธิ์ใช้งาน กรุณาสร้าง License ให้ลูกค้า':'สร้างบัญชี '+email+' สำเร็จ แต่ยังไม่ได้บันทึกข้อมูลสิทธิ์ กรุณาเลือกบัญชีและกำหนด License');
   }catch(e){setCreateError(e instanceof Error?e.message:'สร้างบัญชีไม่สำเร็จ กรุณารีเฟรชรายชื่อก่อนลองใหม่');}finally{setCreateBusy(false);}
 }
 const [users,setUsers]=useState<Account[]>([]),[loading,setLoading]=useState(true),[message,setMessage]=useState(''),[error,setError]=useState(''),[query,setQuery]=useState('');
 const rpcRef=useRef(rpc);rpcRef.current=rpc;
 const alive=useRef(false);
 async function load(saved=false){
   if(!alive.current)return;
   setLoading(true);setError('');setMessage('');
   try{
     // Database RPC revalidates the caller's current admin license, independently of the UI.
     const data=await rpcRef.current('inspection_admin_list_users');
     if(!Array.isArray(data))throw Error('ไม่พบข้อมูลบัญชี');
     if(alive.current){setUsers(data as Account[]);if(saved)setMessage('บันทึกสิทธิ์เรียบร้อยแล้ว');}
   }catch(e){if(alive.current){setUsers([]);setError(e instanceof Error?e.message:'ไม่สามารถเรียกดูบัญชีได้');}}
   finally{if(alive.current)setLoading(false);}
 }
 useEffect(()=>{alive.current=true;void load();return()=>{alive.current=false;};},[]);
 useEffect(()=>{const listener=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose();};window.addEventListener('keydown',listener);return()=>window.removeEventListener('keydown',listener);},[onClose]);
 const rows=users.filter(u=>((u.email||'')+' '+(u.display_name||'')).toLowerCase().includes(query.trim().toLowerCase()));
 return <div className="fixed inset-0 z-[120] bg-slate-900/60 flex items-center justify-center p-3" role="dialog" aria-modal="true" aria-labelledby="admin-license-title">
 <section className="bg-white rounded-2xl shadow-xl max-w-6xl w-full max-h-[90vh] overflow-auto">
 <header className="sticky top-0 bg-slate-900 text-white p-4 flex items-center justify-between gap-3"><div><h2 id="admin-license-title" className="font-bold text-lg">จัดการบัญชีผู้ใช้และ License</h2><p className="text-xs text-slate-300">ผู้ดูแลระบบ · TEAM INSPECTION PRO ELITE</p></div><button type="button" onClick={onClose} className="border border-slate-500 rounded-lg px-3 py-2 text-sm">ปิด</button></header>
 <div className="p-4 space-y-4">
 <div className="grid grid-cols-3 gap-2 text-sm"><div className="bg-slate-100 p-3 rounded-xl">บัญชีทั้งหมด<strong className="block text-xl">{users.length}</strong></div><div className="bg-emerald-50 p-3 rounded-xl">ใช้งานได้<strong className="block text-xl">{users.filter(u=>state(u)==='ใช้งานได้').length}</strong></div><div className="bg-amber-50 p-3 rounded-xl">ยังไม่มีสิทธิ์ / ระงับ<strong className="block text-xl">{users.filter(u=>state(u)!=='ใช้งานได้').length}</strong></div></div>
 <div className="flex flex-wrap items-center gap-2"><input aria-label="ค้นหาบัญชี" placeholder="ค้นหาอีเมลหรือชื่อ" value={query} onChange={e=>setQuery(e.target.value)} className="border rounded-lg p-2 flex-1 min-w-[160px] text-sm"/><button type="button" onClick={()=>void load()} disabled={loading} className="border rounded-lg px-3 py-2 text-sm">รีเฟรช</button><button type="button" onClick={()=>{setCreateError('');setCreateOpen(true);}} className="bg-blue-700 text-white px-3 py-2 rounded-lg text-sm font-semibold">+ สร้างบัญชีลูกค้า</button></div>
 <p className="text-xs text-slate-500">สร้างบัญชีลูกค้าในหน้านี้ แล้วเลือกแพ็กเกจและจำนวนวันเพื่อออกรหัส License หรือบันทึกสิทธิ์โดยตรง รหัสใช้ได้ครั้งเดียว ไม่จัดเก็บไฟล์งานลูกค้า</p>
 {error&&<p role="alert" className="text-red-700 text-sm">{error}</p>}{message&&<p role="status" className="text-emerald-700 text-sm">{message}</p>}
 {loading?<p className="text-sm text-slate-500">กำลังโหลดรายชื่อ...</p>:<div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-100 text-left"><tr>{['อีเมล / ชื่อ','สิทธิ์ / สถานะ','แพ็กเกจ','หมดอายุ (เวลาท้องถิ่น)','การใช้งาน','จัดการ'].map(x=><th className="p-3 whitespace-nowrap" key={x}>{x}</th>)}</tr></thead><tbody>{rows.map(u=><AccountRow key={u.user_id} u={u} rpc={rpcRef.current} onSaved={()=>load(true)} deleteCustomer={deleteCustomer} onDeleted={async()=>{await load();if(alive.current)setMessage('ลบบัญชีผู้ใช้สำเร็จ');}}/>)}</tbody></table>{!rows.length&&!error&&<p className="p-4 text-slate-500">ไม่พบบัญชี</p>}</div>}
 {createOpen&&<div className="fixed inset-0 z-[140] bg-slate-900/60 flex items-center justify-center p-3" role="dialog" aria-modal="true" aria-labelledby="create-customer-title"><form onSubmit={submitCustomer} className="bg-white w-full max-w-md max-h-[90vh] overflow-auto rounded-2xl p-5 shadow-xl space-y-3">
 <h3 id="create-customer-title" className="text-lg font-bold">สร้างบัญชีลูกค้าใหม่</h3><p className="text-sm text-slate-500">บัญชีใหม่จะยังไม่เปิดสิทธิ์ใช้งาน จนกว่าจะได้รับ License</p>
 <label className="block text-sm font-semibold">ชื่อ-นามสกุล<input required maxLength={150} value={customerName} onChange={e=>setCustomerName(e.target.value)} disabled={createBusy} className="block w-full border border-slate-300 rounded-lg p-2 mt-1"/></label>
 <label className="block text-sm font-semibold">อีเมล<input required type="email" maxLength={254} autoComplete="off" value={customerEmail} onChange={e=>setCustomerEmail(e.target.value)} disabled={createBusy} className="block w-full border border-slate-300 rounded-lg p-2 mt-1"/></label>
 <label className="block text-sm font-semibold">รหัสผ่านเริ่มต้น<input required type={showPassword?'text':'password'} autoComplete="new-password" minLength={12} maxLength={128} value={customerPassword} onChange={e=>setCustomerPassword(e.target.value)} disabled={createBusy} className="block w-full border border-slate-300 rounded-lg p-2 mt-1"/></label>
 <div className="flex gap-2 flex-wrap"><button type="button" disabled={createBusy} onClick={generatePassword} className="border rounded-lg px-2 py-1 text-xs">สุ่มรหัสผ่านปลอดภัย</button><button type="button" onClick={()=>setShowPassword(v=>!v)} className="border rounded-lg px-2 py-1 text-xs">{showPassword?'ซ่อนรหัสผ่าน':'แสดงรหัสผ่าน'}</button></div>
 <p className="text-xs text-slate-500">อย่างน้อย 12 ตัว มีตัวอักษรอังกฤษและตัวเลข โปรดเก็บรหัสไว้เพื่อส่งให้ลูกค้าอย่างปลอดภัย ระบบไม่แสดงรหัสเดิมหลังสร้างบัญชี ตรวจสอบอีเมลกับลูกค้าก่อนสร้าง</p>
 {createError&&<p className="text-sm text-red-700" role="alert">{createError}</p>}
 <div className="flex justify-end gap-2"><button type="button" disabled={createBusy} onClick={closeCreate} className="border rounded-lg px-3 py-2">ยกเลิก</button><button type="submit" disabled={createBusy} className="bg-blue-700 text-white rounded-lg px-3 py-2 font-semibold disabled:opacity-50">{createBusy?'กำลังสร้างบัญชี…':'สร้างบัญชีลูกค้า'}</button></div>
 </form></div>}
 </div></section></div>;
}
