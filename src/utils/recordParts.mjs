// Private string parts: public JSON and SHA-256 remain byte-for-byte identical.
const attached=new WeakMap();
export const PART_SIZE=1024*1024;
export function attachParts(records,key,parts){let m=attached.get(records);if(!m)attached.set(records,m=new Map());m.set(key,parts);}
export function getParts(records,key){return attached.get(records)?.get(key);}
export function splitString(value,size=PART_SIZE){const out=[];for(let at=0;at<value.length;){let end=Math.min(value.length,at+size);const c=value.charCodeAt(end-1);if(end<value.length&&end>at+1&&c>=0xd800&&c<=0xdbff)end--;out.push(value.slice(at,end));at=end;}return out.length?out:[''];}
export function joinParts(parts,start=0,end=parts.length){if(end-start<=1)return parts[start]||'';const mid=(start+end)>>1;return joinParts(parts,start,mid)+joinParts(parts,mid,end);}
export function parseParts(parts){
 let part=0,at=0;
 function more(){while(part<parts.length&&at>=parts[part].length){part++;at=0;}return part<parts.length;}
 function peek(){return more()?parts[part][at]:'';}
 function take(){if(!more())throw Error('Incomplete JSON record');return parts[part][at++];}
 function space(){while(more()&&/[\x20\t\r\n]/.test(parts[part][at]))at++;}
 function expect(c){space();if(take()!==c)throw Error('Invalid JSON record');}
 function str(){if(take()!=='"')throw Error('Invalid JSON string');const raw=['"'];let escaped=false;
  while(more()){const s=parts[part],start=at;
   while(at<s.length){if(escaped){at++;escaped=false;continue;}const q=s.indexOf('"',at),slash=s.indexOf('\\',at),next=q<0?slash:slash<0?q:Math.min(q,slash);if(next<0){at=s.length;break;}at=next+1;if(s[next]==='\\'){escaped=true;continue;}raw.push(s.slice(start,at));return JSON.parse(joinParts(raw));}
   if(at>start)raw.push(s.slice(start,at));
  }throw Error('Incomplete JSON string');
 }
 function val(depth=0){if(depth>256)throw Error('JSON record too deeply nested');space();const c=peek();if(c==='"')return str();if(c==='['){take();const out=[];space();if(peek()===']'){take();return out;}for(;;){out.push(val(depth+1));space();const d=take();if(d===']')return out;if(d!==',')throw Error('Invalid JSON array');}}
  if(c==='{'){take();const out={};space();if(peek()==='}'){take();return out;}for(;;){space();const k=str();expect(':');const x=val(depth+1);Object.defineProperty(out,k,{value:x,writable:true,enumerable:true,configurable:true});space();const d=take();if(d==='}')return out;if(d!==',')throw Error('Invalid JSON object');}}
  let token='';while(more()&&!/[\x20\t\r\n,}\]]/.test(peek())){token+=take();if(token.length>1024)throw Error('Invalid JSON primitive');}if(!token)throw Error('Missing JSON value');return JSON.parse(token);
 }
 const result=val();space();if(more())throw Error('Trailing JSON record data');return result;
}
// Escape a record string without flattening the whole string. Preserve surrogate pairs.
export function* escapedParts(parts){let carry='';for(const source of parts){for(let part of splitString(source,262144)){if(!part)continue;part=carry+part;carry='';const c=part.charCodeAt(part.length-1);if(c>=0xd800&&c<=0xdbff){carry=part.slice(-1);part=part.slice(0,-1);}if(part)yield JSON.stringify(part).slice(1,-1);}}if(carry)yield JSON.stringify(carry).slice(1,-1);}
export function recordMapParts(records){const out=['{'];let sep='';for(const key of Object.keys(records)){out.push(sep,JSON.stringify(key),':"');for(const p of escapedParts(getParts(records,key)||splitString(records[key])))out.push(p);out.push('"');sep=',';}out.push('}');return out;}
// Bounded serialization for plain JSON inspection data.
export function serializeParts(value){const parts=[];let pending=[],length=0;const flush=()=>{if(length){parts.push(joinParts(pending));pending=[];length=0;}};function add(s){if(!s)return;if(s.length>=PART_SIZE){flush();parts.push(...splitString(s));return;}if(length+s.length>PART_SIZE)flush();pending.push(s);length+=s.length;}
 const stack=new Set();function item(v){if(v===null||typeof v!=='object'){const s=JSON.stringify(v);add(s===undefined?'null':s);return;}if(Object.getPrototypeOf(v)!==Object.prototype&&Object.getPrototypeOf(v)!==null&&!Array.isArray(v)){add(JSON.stringify(v));return;}if(stack.has(v))throw TypeError('Circular JSON');stack.add(v);if(Array.isArray(v)){add('[');for(let i=0;i<v.length;i++){if(i)add(',');item(v[i]);}add(']');}else{add('{');let sep='';for(const k of Object.keys(v)){const x=v[k];if(x===undefined||typeof x==='function'||typeof x==='symbol')continue;add(sep);add(JSON.stringify(k));add(':');item(x);sep=',';}add('}');}stack.delete(v);}item(value);flush();return parts;}
