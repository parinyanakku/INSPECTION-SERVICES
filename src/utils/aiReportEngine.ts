import {workspaceStorage,flushWorkspace} from './workspaceStorage';
import {callGeminiDirect,fetchAvailableGeminiModels,loadGeminiConfig} from './geminiClient';
import {allowedModel,defaults,normalizeSettings,routeOrder,mayFallback,providerNames,type EngineSettings,type Provider,type Route} from './aiRouterPolicy';
export const AI_ENGINE_KEY='tis_ai_engine_local_v1';
const PROXY='https://geleptwbxjoumxyxbhqa.supabase.co/functions/v1/inspection-ai-report';
const PUBLIC_KEY='sb_publishable_v-AeQKI2OT9QRGVP1HVHbQ_STCiFAnk';
export function loadAIEngine():EngineSettings{try{return normalizeSettings(JSON.parse(workspaceStorage.getItem(AI_ENGINE_KEY)||'null'));}catch{return defaults();}}
export async function saveAIEngine(s:EngineSettings){workspaceStorage.setItem(AI_ENGINE_KEY,JSON.stringify(normalizeSettings(s)));if(!await flushWorkspace())throw Error('SETTINGS_SAVE_FAILED');window.dispatchEvent(new Event('tis-ai-engine-change'));}
export function getKey(s:EngineSettings,p:Provider){return s.configs[p]?.key||(p==='gemini'?loadGeminiConfig().apiKey:'');}
export function getModel(s:EngineSettings,p:Provider){return s.configs[p]?.model||(p==='gemini'?loadGeminiConfig().model:'');}
export type AIResult={text:string;provider:Provider;model:string;inputTokens?:number;outputTokens?:number};
export class AIEngineError extends Error{constructor(public status:number,message:string){super(message);}}
async function proxy(body:object){
 let token='';try{token=JSON.parse(sessionStorage.getItem('tis_auth_tab_session_v1')||'null')?.access_token||'';}catch{}
 if(!token)throw new AIEngineError(401,'SESSION_REQUIRED');
 const r=await fetch(PROXY,{method:'POST',headers:{Authorization:'Bearer '+token,apikey:PUBLIC_KEY,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(85000),cache:'no-store'});
 const j=await r.json().catch(()=>null);
 if(!r.ok||!j)throw new AIEngineError(r.status,r.status===503&&j?.error==='LOCAL_RATE_LIMIT'?'AI_LOCAL_RATE_LIMIT':'AI_PROXY_'+r.status);
 return j;
}
export async function listAIModels(p:Provider,key:string):Promise<string[]>{
 if(!key.trim())throw Error('MISSING_API_KEY');
 const models=p==='gemini'?await fetchAvailableGeminiModels(key):(await proxy({action:'models',provider:p,key})).models;
 if(!Array.isArray(models))throw Error('NO_MODEL');
 return [...new Set(models.filter((x:unknown):x is string=>typeof x==='string'&&allowedModel(p,x)))].slice(0,500);
}
export async function resolveRoutes(s:EngineSettings):Promise<Route[]>{
 const routes:Route[]=[];
 for(const provider of routeOrder(s)){
  const key=getKey(s,provider);let model=getModel(s,provider);
  if(!key)continue;
  if(provider==='gemini'&&model==='auto'){
   // Preserve existing Gemini automatic preference, without silently escalating to Pro.
   const models=await listAIModels(provider,key);
   model=models.find(m=>/flash-lite/i.test(m))||models.find(m=>/flash/i.test(m))||'';
  }
  if(allowedModel(provider,model))routes.push({provider,key,model});
 }
 return routes;
}
async function execute(route:Route,prompt:string):Promise<AIResult>{
 const {provider,key,model}=route;
 if(provider==='gemini'){
  const r=await callGeminiDirect<any>(key,model,{contents:[{parts:[{text:prompt}]}],generationConfig:{responseMimeType:'application/json',maxOutputTokens:8192}},60000);
  return {provider,model,text:r.candidates?.[0]?.content?.parts?.filter((p:any)=>!p.thought).map((p:any)=>p.text||'').join('')||'',inputTokens:r.usageMetadata?.promptTokenCount,outputTokens:r.usageMetadata?.candidatesTokenCount};
 }
 const r=await proxy({action:'generate',provider,key,model,prompt});
 return {provider,model,text:typeof r.text==='string'?r.text:'',inputTokens:r.inputTokens,outputTokens:r.outputTokens};
}
export async function generateReportAI(prompt:string,confirm:(routes:Pick<Route,'provider'|'model'>[])=>boolean):Promise<AIResult>{
 const s=loadAIEngine();const routes=await resolveRoutes(s);
 if(!routes.length)throw Error('MISSING_API_KEY_OR_MODEL');
 if(!confirm(routes.map(({provider,model})=>({provider,model}))))throw Error('AI_CANCELLED');
 for(let i=0;i<routes.length;i++){
  try{return await execute(routes[i],prompt);}catch(e){if(i===routes.length-1||!mayFallback(s,Number((e as {status?:number})?.status)))throw e;}
 }
 throw Error('NO_MODEL');
}
