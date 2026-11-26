'use strict';
const API='https://geleptwbxjoumxyxbhqa.supabase.co';
const KEY="sb_publishable_v-AeQKI2OT9QRGVP1HVHbQ_STCiFAnk";
const REDIRECT='https://teaminspectionproelite.github.io/INSPECTION-SERVICES/reset-password.html';
const VERIFIER='tis_password_recovery_pkce_v1';
const $=id=>document.getElementById(id);
let token=null;
function status(s,ok=false){$('status').textContent=s;$('status').style.color=ok?'#166534':'#b91c1c';}
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
