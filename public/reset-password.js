'use strict';
const API='https://geleptwbxjoumxyxbhqa.supabase.co';
const KEY="sb_publishable_v-AeQKI2OT9QRGVP1HVHbQ_STCiFAnk";
const REDIRECT='https://teaminspectionproelite.github.io/INSPECTION-SERVICES/reset-password.html';
const VERIFIER='tis_password_recovery_pkce_v1';
const $=id=>document.getElementById(id);
let token=null;
let english=false;try{english=localStorage.getItem('tis_ui_language_v1')==='en';}catch{}
const translations={"ลืมรหัสผ่าน?":"Forgot password?","กรอกอีเมลที่ลงทะเบียนไว้เพื่อขอลิงก์ตั้งรหัสผ่านใหม่":"Enter your registered email to request a password reset link.","อีเมล":"Email","ส่งลิงก์รีเซ็ตรหัสผ่าน":"Send password reset link","เปิดลิงก์จากอีเมลด้วยเบราว์เซอร์และโปรไฟล์เดียวกับที่ขอรีเซ็ต ตรวจสอบโฟลเดอร์สแปม หากไม่ได้รับอีเมลให้ติดต่อผู้ดูแล":"Open the email link in the same browser and profile. Check spam or contact the administrator if you do not receive it.","ตั้งรหัสผ่านใหม่":"Set a new password","รหัสผ่านใหม่":"New password","ยืนยันรหัสผ่านใหม่":"Confirm new password","บันทึกรหัสผ่านใหม่":"Save new password","อย่างน้อย 12 ตัว มีตัวอักษรอังกฤษและตัวเลข":"At least 12 characters with letters and numbers.","กลับเข้าสู่ระบบ":"Back to sign in","กำลังส่งคำขอ…":"Sending request…","หากอีเมลมีบัญชีและระบบส่งอีเมลพร้อมใช้งาน กรุณาตรวจสอบกล่องจดหมายและสแปม":"If an account exists and email delivery is configured, check your inbox and spam folder.","ขอรหัสบ่อยเกินไป กรุณาลองภายหลัง":"Too many requests. Try again later.","ไม่สามารถส่งคำขอได้ กรุณาลองใหม่หรือติดต่อผู้ดูแล":"Could not send the request. Try again or contact the administrator.","ลิงก์หมดอายุหรือใช้ไม่ได้ กรุณาขอใหม่":"Link expired or invalid. Request a new link.","ลิงก์ไม่รองรับ กรุณาขอรีเซ็ตใหม่จากหน้านี้":"Unsupported link. Request a new reset link here.","กำลังตรวจสอบลิงก์…":"Verifying link…","ยืนยันลิงก์สำเร็จ กรุณาตั้งรหัสผ่านใหม่":"Link verified. Set a new password.","ลิงก์ไม่ถูกต้อง หมดอายุ หรือเปิดคนละเบราว์เซอร์ กรุณาขอใหม่":"Invalid or expired link, or a different browser was used. Request a new link.","รหัสผ่านใหม่ไม่ตรงตามเงื่อนไข":"Password does not meet the requirements.","รหัสผ่านใหม่ไม่ตรงกัน":"Passwords do not match.","ตั้งรหัสผ่านใหม่สำเร็จ กรุณากลับเข้าสู่ระบบด้วยรหัสใหม่":"Password reset successfully. Sign in with your new password.","ตั้งรหัสผ่านไม่สำเร็จ หากลิงก์หมดอายุให้โหลดหน้าใหม่เพื่อขอลิงก์อีกครั้ง":"Password reset failed. If the link expired, reload and request another link."};
if(english){document.documentElement.lang='en';document.title='Forgot password | TEAM INSPECTION PRO ELITE';for(const el of document.querySelectorAll('main h2,main label,main button,main small,main p,main a')){if(!el.children.length&&translations[el.textContent.trim()])el.textContent=translations[el.textContent.trim()];}}

function status(s,ok=false){$('status').textContent=english?(translations[s]||s):s;$('status').style.color=ok?'#166534':'#b91c1c';}
function base64url(bytes){return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
async function api(path,method,body,access){
 const headers={apikey:KEY,'Content-Type':'application/json'};if(access)headers.Authorization='Bearer '+access;
 const r=await fetch(API+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),cache:'no-store',signal:AbortSignal.timeout(15000)});
 const data=await r.json().catch(()=>null);if(!r.ok){const e=new Error('Request failed');e.status=r.status;throw e;}return data;
}
$('requestForm').addEventListener('submit',async e=>{
 e.preventDefault();$('send').disabled=true;status('กำลังส่งคำขอ…',true);
 try{
  const verifier=base64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge=base64url(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))));
  localStorage.setItem(VERIFIER,JSON.stringify({verifier,created:Date.now()}));
  await api('/auth/v1/recover?redirect_to='+encodeURIComponent(REDIRECT),'POST',{email:$('email').value.trim(),code_challenge:challenge,code_challenge_method:'s256'});
  status('หากอีเมลมีบัญชีและระบบส่งอีเมลพร้อมใช้งาน กรุณาตรวจสอบกล่องจดหมายและสแปม',true);
 }catch(e){status(e.status===429?'ขอรหัสบ่อยเกินไป กรุณาลองภายหลัง':'ไม่สามารถส่งคำขอได้ กรุณาลองใหม่หรือติดต่อผู้ดูแล');}
 finally{$('send').disabled=false;}
});
async function init(){
 const q=new URLSearchParams(location.search),h=new URLSearchParams(location.hash.slice(1));
 const code=q.get('code');
 // Remove all callback parameters before rendering or further network requests.
 if(location.search||location.hash)history.replaceState(null,'',location.pathname);
 if(q.has('error')||h.has('error')){status('ลิงก์หมดอายุหรือใช้ไม่ได้ กรุณาขอใหม่');return;}
 if(!code){if(h.has('access_token'))status('ลิงก์ไม่รองรับ กรุณาขอรีเซ็ตใหม่จากหน้านี้');return;}
 $('request').hidden=true;status('กำลังตรวจสอบลิงก์…',true);
 try{
  const pending=JSON.parse(localStorage.getItem(VERIFIER)||'null');
  if(!pending?.verifier||Date.now()-pending.created>3600000)throw Error('Missing verifier');
  localStorage.removeItem(VERIFIER);
  const data=await api('/auth/v1/token?grant_type=pkce','POST',{auth_code:code,code_verifier:pending.verifier});
  if(!data?.access_token)throw Error('No recovery session');
  token=data.access_token;$('reset').hidden=false;status('ยืนยันลิงก์สำเร็จ กรุณาตั้งรหัสผ่านใหม่',true);
 }catch{$('request').hidden=false;status('ลิงก์ไม่ถูกต้อง หมดอายุ หรือเปิดคนละเบราว์เซอร์ กรุณาขอใหม่');}
}
$('resetForm').addEventListener('submit',async e=>{
 e.preventDefault();if(!token)return;
 const p=$('newPassword').value;
 if(p.length<12||p.length>128||!/[A-Za-z]/.test(p)||!/[0-9]/.test(p)){status('รหัสผ่านใหม่ไม่ตรงตามเงื่อนไข');return;}
 if(p!==$('confirm').value){status('รหัสผ่านใหม่ไม่ตรงกัน');return;}
 $('save').disabled=true;
 try{
  await api('/auth/v1/user','PUT',{password:p},token);
  const old=token;token=null;$('reset').hidden=true;
  try{await api('/auth/v1/logout?scope=global','POST',undefined,old);}catch{}
  status('ตั้งรหัสผ่านใหม่สำเร็จ กรุณากลับเข้าสู่ระบบด้วยรหัสใหม่',true);
 }catch{status('ตั้งรหัสผ่านไม่สำเร็จ หากลิงก์หมดอายุให้โหลดหน้าใหม่เพื่อขอลิงก์อีกครั้ง');}
 finally{$('newPassword').value='';$('confirm').value='';$('save').disabled=false;}
});
void init();
