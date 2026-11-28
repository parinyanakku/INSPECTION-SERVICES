export const providers=['gemini','openai','claude','deepseek','grok','openrouter'] as const;
export type Provider=typeof providers[number];
export const providerNames:Record<Provider,string>={gemini:'Google Gemini',openai:'OpenAI GPT',claude:'Anthropic Claude',deepseek:'DeepSeek',grok:'xAI Grok',openrouter:'OpenRouter'};
export type Route={provider:Provider;key:string;model:string};
export type ProviderSetting={key:string;model:string;enabled:boolean};
export type EngineSettings={mode:'auto'|'manual';primary:Provider;fallback:boolean;configs:Partial<Record<Provider,ProviderSetting>>};
export const defaults=():EngineSettings=>({mode:'manual',primary:'gemini',fallback:false,configs:{gemini:{key:'',model:'',enabled:true}}});
export function normalizeSettings(value:unknown):EngineSettings{
 const s=value as Partial<EngineSettings>|null;const d=defaults();
 if(!s||typeof s!=='object')return d;
 d.mode=s.mode==='auto'?'auto':'manual';d.primary=providers.includes(s.primary as Provider)?s.primary as Provider:'gemini';d.fallback=s.fallback===true;
 for(const p of providers){const c=s.configs?.[p];if(c&&typeof c==='object')d.configs[p]={key:typeof c.key==='string'?c.key.trim().slice(0,2048):'',model:typeof c.model==='string'?c.model.trim().slice(0,200):'',enabled:c.enabled===true};}
 return d;
}
export function routeOrder(settings:EngineSettings):Provider[]{
 const active=(p:Provider)=>settings.configs[p]?.enabled===true;
 if(settings.mode==='manual')return active(settings.primary)?[settings.primary]:[];
 const order=[settings.primary,...providers.filter(p=>p!==settings.primary)].filter(active);
 return settings.fallback?order:order.slice(0,1);
}
// Only a confirmed upstream rate rejection may trigger an expressly allowed fallback.
// Timeouts and malformed results may already have incurred a charge.
export function mayFallback(settings:EngineSettings,status:number){return settings.mode==='auto'&&settings.fallback&&status===429;}
export function allowedModel(p:Provider,id:string){
 if(!/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,199}$/.test(id)||/(^|\/)auto($|:)|embedding|(^|[-/])tts|whisper|moderation|image-generation|dall-e|realtime|audio|transcri|rerank|video/i.test(id))return false;
 if(p==='gemini')return /^gemini-/i.test(id)&&!/(image|live|robotics)/i.test(id);
 if(p==='openai')return /^(gpt-|o[1-9])/i.test(id)&&!/(image|search|codex)/i.test(id);
 if(p==='claude')return /^claude-/i.test(id);
 if(p==='deepseek')return /^deepseek-/i.test(id);
 if(p==='grok')return /^grok-/i.test(id)&&!/(multi-agent|imagine|image)/i.test(id);
 return id.includes('/')&&!/^openrouter\//i.test(id);
}
