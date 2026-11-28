import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

// These exact imported prototypes predate the authenticated workspace.
// No wildcard removal of current project assets or customer reports.
export const legacyPrototypePaths=[
 'assets/aistudio/Paste_November_26__2026_-_9_18AM_948acb92',
 'assets/aistudio/ai_defect_white_label_8a53eb5b.html'
];
export function removeLegacyPrototypes(root){
 for(const name of legacyPrototypePaths)fs.rmSync(path.join(root,name),{force:true});
}
function* walk(root){
 for(const item of fs.readdirSync(root,{withFileTypes:true})){
  const name=path.join(root,item.name);
  if(item.isSymbolicLink()){yield {name,link:true};continue;}
  if(item.isDirectory())yield* walk(name);
  else if(item.isFile())yield {name,link:false};
 }
}
// Deliberately high-confidence checks. Never print matching secrets.
// Public Supabase publishable/anon keys and OAuth client IDs are not secrets.
export function secretFindings(text){
 const findings=[];
 const rules=[
 ['private-key',/-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/],
 ['supabase-secret',/\bsb_secret_[A-Za-z0-9_-]{20,}\b/],
 ['github-token',/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/],
 ['google-api-key',/\bAIza[A-Za-z0-9_-]{35}\b/],
 ['openai-or-anthropic-key',/\bsk-(?:proj-|ant-api\d+-|svcacct-)[A-Za-z0-9_-]{25,}\b/],
 ['google-oauth-secret',/\bGOCSPX-[A-Za-z0-9_-]{20,}\b/]
 ];
 for(const [label,pattern] of rules)if(pattern.test(text))findings.push(label);
 for(const match of text.matchAll(/\beyJ[A-Za-z0-9_-]{8,}\.([A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{12,}\b/g)){
  try{const claims=JSON.parse(Buffer.from(match[1],'base64url').toString('utf8'));if(claims.role==='service_role'){findings.push('service-role-jwt');break;}}catch{}
 }
 return findings;
}
function safeText(file){
 const stat=fs.statSync(file);
 if(stat.size>32*1024*1024)return null;
 const buffer=fs.readFileSync(file);
 if(buffer.subarray(0,8192).includes(0))return null;
 return buffer.toString('utf8');
}
export function scanSource(root){
 const files=execFileSync('git',['ls-files','-z'],{cwd:root,maxBuffer:8*1024*1024}).toString().split('\0').filter(Boolean);
 const failures=[];
 for(const name of files){
  if(name==='scripts/security-build.mjs'||name==='tests/security-build.test.mjs')continue;
  const abs=path.join(root,name);
  if(!fs.existsSync(abs))continue;
  if(/(?:^|\/)\.env(?:$|\.)/i.test(name)&&!/(?:^|\/)\.env\.example$/.test(name))failures.push({path:name,reason:'environment-file'});
  if(/\.(?:p12|pfx|jks|keystore|pem|key)$/i.test(name))failures.push({path:name,reason:'private-key-file'});
  if(!/\.(?:js|mjs|cjs|jsx|ts|tsx|json|html|txt|md|yml|yaml|toml|sql|ps1|swift|java|cs|xml|sh|env|example)$/i.test(name))continue;
  const content=safeText(abs);if(content===null)continue;
  for(const reason of secretFindings(content))failures.push({path:name,reason});
 }
 return failures;
}
export function scanPublished(root,{scanSecrets=true}={}){
 const failures=[];
 for(const {name,link} of walk(root)){
  const relative=path.relative(root,name).split(path.sep).join('/');
  if(link){failures.push({path:relative,reason:'symlink'});continue;}
  if(legacyPrototypePaths.some(p=>relative===p||relative.endsWith('/'+p)))failures.push({path:relative,reason:'legacy-prototype'});
  if(/\.map$/i.test(relative)){failures.push({path:relative,reason:'source-map'});continue;}
  if(/(?:^|\/)(?:\.git(?:\/|$)|\.env(?:$|\.))|\.(?:p12|pfx|jks|keystore|pem|key)$/i.test(relative)){failures.push({path:relative,reason:'private-artifact'});continue;}
  if(!scanSecrets||!/\.(?:js|mjs|cjs|css|html|json|txt|ts|tsx|jsx)$/i.test(relative))continue;
  const content=safeText(name);
  if(content===null){if(/\.(?:js|mjs|cjs|html)$/i.test(relative))failures.push({path:relative,reason:'unscanned-code'});continue;}
  // Match actual end-of-line mapping directives, not incidental library strings.
  if(/(?:^|\n)[ \t]*\/\/[#@][ \t]*sourceMappingURL=|\/\*[#@][ \t]*sourceMappingURL=/m.test(content))failures.push({path:relative,reason:'source-map-directive'});
  for(const reason of secretFindings(content))failures.push({path:relative,reason});
 }
 return failures;
}
export function removePublishedMaps(root){
 for(const {name,link} of walk(root))if(!link&&/\.map$/i.test(name))fs.rmSync(name);
}
function check(failures){
 if(failures.length){for(const f of failures)console.error('[security]',f.reason,f.path);throw Error('Security build gate rejected '+failures.length+' finding(s); values not logged');}
 console.log('Security gate passed (limited signature checks, not a full audit)');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const mode=process.argv[2];
 if(mode==='source')check(scanSource(process.cwd()));
 else if(mode==='build')check(scanPublished(path.resolve(process.argv[3]||'dist')));
 else if(mode==='archive')check(scanPublished(path.resolve(process.argv[3]||'dist'),{scanSecrets:false}));
 else throw Error('Expected source, build or archive');
}
