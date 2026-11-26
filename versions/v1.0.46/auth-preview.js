'use strict';
// Public browser key only. All authorization for licenses lives in database RPCs.
const API='https://geleptwbxjoumxyxbhqa.supabase.co';
const PUBLIC_KEY="sb_publishable_v-AeQKI2OT9QRGVP1HVHbQ_STCiFAnk";
const $=id=>document.getElementById(id);
let token=null, user=null, generation=0, adminMode=false;
function message(text,ok=false){$('message').textContent=text;$('message').className=ok?'good':'';}
async function api(path,{method='GET',body,auth=true}={}){
 const headers={apikey:PUBLIC_KEY,'Content-Type':'application/json'};
 if(auth&&token)headers.Authorization='Bearer '+token;
 const r=await fetch(API+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),cache:'no-store',signal:AbortSignal.timeout(15000)});
 const raw=await r.text();let data;try{data=raw?JSON.parse(raw):null;}catch{data=null;}
 if(!r.ok){const error=new Error(r.status===401?'เซสชันหมดอายุหรืออีเมล/รหัสผ่านไม่ถูกต้อง':(data?.message||data?.msg||'เชื่อมต่อไม่สำเร็จ ('+r.status+')'));error.status=r.status;throw error;}
 return data;
}
const rpc=(name,body={})=>api('/rest/v1/rpc/'+name,{method:'POST',body});
function clear(){generation++;token=null;user=null;adminMode=false;$('users').replaceChildren();$('identity').textContent='';$('license').textContent='';$('account').hidden=true;$('admin').hidden=true;$('login').hidden=false;$('password').value='';}
function el(tag,text){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;}
function localDate(value){if(!value)return '';const d=new Date(value);if(Number.isNaN(d.getTime()))return '';const z=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+z(d.getMonth()+1)+'-'+z(d.getDate())+'T'+z(d.getHours())+':'+z(d.getMinutes());}
const labels={trial:'ทดลองใช้',monthly:'รายเดือน',yearly:'รายปี',lifetime:'ตลอดชีพ',custom:'กำหนดเอง'};
function expiryFor(plan){const d=new Date();d.setDate(d.getDate()+({trial:7,monthly:30,yearly:365}[plan]||30));return localDate(d);}
function row(u){
 const tr=el('tr'),name=el('td'),email=el('div',u.email||u.user_id),display=el('input');display.value=u.display_name||'';display.placeholder='ชื่อผู้ใช้';display.setAttribute('aria-label','ชื่อผู้ใช้ '+(u.email||''));name.append(email,display);
 const role=el('td',u.role==='admin'?'ผู้ดูแลระบบ':'ลูกค้า');
 const plan=el('select');Object.entries(labels).forEach(([value,label])=>{const opt=el('option',label);opt.value=value;plan.append(opt)});plan.value=u.plan||'trial';plan.setAttribute('aria-label','แพ็กเกจ');
 const date=el('input');date.type='datetime-local';date.value=localDate(u.expires_at)||(plan.value==='lifetime'?'':expiryFor(plan.value));date.disabled=plan.value==='lifetime';date.setAttribute('aria-label','วันหมดอายุ');
 plan.addEventListener('change',()=>{date.disabled=plan.value==='lifetime';date.value=date.disabled?'':expiryFor(plan.value);});
 const active=el('input');active.type='checkbox';active.checked=!!u.active;active.style.width='auto';active.setAttribute('aria-label','เปิดใช้งาน');
 const save=el('button','บันทึก');save.type='button';
 if(u.role==='admin'){[display,plan,date,active,save].forEach(n=>n.disabled=true);save.textContent='ผู้ดูแล';}
 save.addEventListener('click',async()=>{if(!adminMode||!token)return;const g=generation;save.disabled=true;try{const expires=plan.value==='lifetime'?null:new Date(date.value);if(expires&&Number.isNaN(expires.getTime()))throw Error('กรุณาระบุวันหมดอายุ');await rpc('inspection_admin_set_license',{p_user_id:u.user_id,p_display_name:display.value,p_plan:plan.value,p_active:active.checked,p_expires_at:expires?expires.toISOString():null});if(g===generation){message('บันทึกสิทธิ์สำเร็จ',true);await listUsers();}}catch(e){if(g===generation)message(e.message);}finally{save.disabled=false;}});
 tr.append(name,role,...[plan,date,active,save].map(node=>{const td=el('td');td.append(node);return td;}));return tr;
}
async function listUsers(){const g=generation;if(!token||!adminMode)return;const users=await rpc('inspection_admin_list_users');if(g!==generation||!adminMode)return;$('users').replaceChildren(...(Array.isArray(users)?users:[]).map(row));}
async function check(){const g=generation;if(!token||!user)return;const [allowed,isAdmin,licenses]=await Promise.all([rpc('inspection_has_access'),rpc('inspection_is_admin'),api('/rest/v1/inspection_licenses?select=role,plan,active,expires_at&user_id=eq.'+encodeURIComponent(user.id))]);if(g!==generation)return;const l=licenses?.[0];adminMode=allowed===true&&isAdmin===true;$('identity').textContent=user.email||'';$('license').textContent=allowed===true?'สิทธิ์ใช้งาน: '+(labels[l?.plan]||'เปิดใช้งาน')+(l?.expires_at?' · หมดอายุ '+new Date(l.expires_at).toLocaleString('th-TH'):''):'ยังไม่ได้รับสิทธิ์ / สิทธิ์หมดอายุ / ถูกระงับ';$('login').hidden=true;$('account').hidden=false;$('admin').hidden=!adminMode;if(adminMode)await listUsers();else $('users').replaceChildren();}
$('loginForm').addEventListener('submit',async e=>{e.preventDefault();$('signIn').disabled=true;message('กำลังตรวจสอบบัญชี…',true);try{const data=await api('/auth/v1/token?grant_type=password',{method:'POST',body:{email:$('email').value.trim(),password:$('password').value},auth:false});$('password').value='';if(!data?.access_token||!data?.user?.id)throw Error('ไม่พบข้อมูลเซสชัน');generation++;token=data.access_token;user=data.user;await check();message('ตรวจสอบบัญชีสำเร็จ',true);}catch(e){clear();message(e.message);}finally{$('signIn').disabled=false;}});
$('logout').addEventListener('click',async()=>{const old=token;clear();if(old)try{await fetch(API+'/auth/v1/logout?scope=local',{method:'POST',headers:{apikey:PUBLIC_KEY,Authorization:'Bearer '+old},signal:AbortSignal.timeout(5000)});}catch{}message('ออกจากระบบแล้ว',true);});
$('refresh').addEventListener('click',()=>check().catch(e=>{clear();message(e.message);}));
setInterval(()=>{if(token)check().catch(e=>{clear();message('ต้องเข้าสู่ระบบใหม่: '+e.message);});},60000);
