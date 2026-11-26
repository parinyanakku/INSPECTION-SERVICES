import type {AppLanguage} from '../types/inspection';
const KEY='tis_ui_language_v1';
export function readUiLanguage():AppLanguage {try{return localStorage.getItem(KEY)==='en'?'en':'th';}catch{return 'th';}}
export function saveUiLanguage(lang:AppLanguage){try{localStorage.setItem(KEY,lang);}catch{}}
const messages:Record<string,string>={
  "เซสชันหมดอายุ": "Session expired.",
  "ยืนยันเซสชันไม่สำเร็จ": "Could not verify the session.",
  "เรียกใช้งานบ่อยเกินไป กรุณาลองใหม่": "Too many requests. Please try again.",
  "ยืนยันบัญชีหรือสิทธิ์ไม่สำเร็จ": "Could not verify your account or access",
  "บัญชียังไม่ได้รับสิทธิ์ หรือสิทธิ์หมดอายุ/ถูกระงับ กรุณาติดต่อผู้ดูแลเพื่อรับรหัสลงทะเบียน": "Access is not activated, has expired, or has been suspended. Contact the administrator for a license code.",
  "บัญชีไม่ตรงกับเซสชันเดิม": "The account does not match the previous session.",
  "ไม่สามารถคืนสถานะเข้าสู่ระบบได้ กรุณาเข้าสู่ระบบใหม่": "Could not restore your session. Please sign in again.",
  "ไม่พบข้อมูลบัญชี": "Account information not found.",
  "เปิดใช้งานรหัสไม่สำเร็จ: ตรวจสอบว่ารหัสตรงกับบัญชีนี้ ยังไม่ถูกใช้ และไม่หมดอายุ หากเคยใช้แล้วให้เข้าสู่ระบบโดยไม่กรอกรหัส": "Activation failed. Check that the code belongs to this account, is unused and has not expired. If already activated, sign in without the code.",
  "เข้าสู่ระบบไม่สำเร็จ": "Sign-in failed.",
  "กรุณาเข้าสู่ระบบใหม่": "Please sign in again.",
  "ยืนยันรหัสผ่านเดิมไม่สำเร็จ": "Could not verify your current password.",
  "เปลี่ยนรหัสผ่านไม่สำเร็จ กรุณาตรวจสอบเงื่อนไขรหัสผ่านแล้วลองใหม่": "Could not change the password. Check the requirements and try again.",
  "ออกจากระบบ? โปรดบันทึกหมุดและงานร่างที่ยังไม่บันทึกก่อน": "Sign out? Save any unfinished pins and drafts first.",
  "ยังบันทึกข้อมูลไม่สำเร็จ โปรดสำรองข้อมูลลงเครื่องก่อน": "Local saving failed. Export a backup first.",
  "ออกจากระบบไม่สำเร็จ": "Sign-out failed.",
  "สิทธิ์หมดอายุหรือถูกระงับ": "Access expired or suspended.",
  "ไม่สามารถยืนยันสิทธิ์ได้ กรุณารีเฟรชเพื่อเชื่อมต่อใหม่ หรือออกจากระบบแล้วเข้าสู่ระบบอีกครั้ง": "Could not verify access. Refresh to reconnect, or sign out and sign in again."
};
export function authMessage(message:string,lang:AppLanguage):string{
 if(lang==='th')return message;
 if(messages[message])return messages[message];
 const code=message.match(/^ยืนยันบัญชีหรือสิทธิ์ไม่สำเร็จ \((\d+)\)$/);
 if(code)return messages['ยืนยันบัญชีหรือสิทธิ์ไม่สำเร็จ']+' ('+code[1]+')';
 return /[\u0E00-\u0E7F]/.test(message)?'Unable to complete the request. Please try again.':message;
}
