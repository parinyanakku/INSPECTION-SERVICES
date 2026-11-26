// Fixed A4 desktop-equivalent report layout for all viewport sizes.
// Do not use OS-installed font variants for HTML measurement.
const ROOT='https://cdn.jsdelivr.net/gh/Phonbopit/sarabun-webfont@8d6f2f4223d025670b70aa344462971678516216/fonts/';
const REG=ROOT+'thsarabunnew-webfont.woff',BOLD=ROOT+'thsarabunnew_bold-webfont.woff';
export const REPORT_LAYOUT_CSS=
  '@font-face{font-family:"TH Sarabun New";font-style:normal;font-weight:400;src:url("'+REG+'") format("woff");font-display:block}'+
  '@font-face{font-family:"TH Sarabun New";font-style:normal;font-weight:700;src:url("'+BOLD+'") format("woff");font-display:block}'+
  '*{box-sizing:border-box;-webkit-text-size-adjust:none;text-size-adjust:none}'+
  'html,body{margin:0;padding:0;width:1123px;min-width:1123px;max-width:1123px;background:white;color:#0f172a;font-family:"TH Sarabun New",Tahoma,sans-serif;font-size:16px;line-height:normal;font-weight:400;letter-spacing:normal;-webkit-text-size-adjust:none;text-size-adjust:none}'+
  '.report-page{flex-shrink:0;-webkit-text-size-adjust:none;text-size-adjust:none}'+
  'table{border-collapse:collapse}tr{break-inside:avoid;page-break-inside:avoid}'+
  'a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important;font:inherit!important;letter-spacing:inherit!important}';
export function reportDocument(html:string){
 return '<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=1123, initial-scale=1"><meta name="format-detection" content="telephone=no,date=no,address=no,email=no,url=no"><style>'+REPORT_LAYOUT_CSS+'</style></head><body>'+html+'</body></html>';
}
export async function waitForReportFonts(doc:Document){
 if(!doc.fonts?.load)throw Error('This browser does not support report fonts');
 const loaded=await Promise.all([doc.fonts.load('400 16px "TH Sarabun New"','ภาษาไทย ABC 123'),doc.fonts.load('700 16px "TH Sarabun New"','ภาษาไทย ABC 123')]);
 if(loaded.some(f=>!f.length||f.some(face=>face.status!=='loaded')))throw Error('TH Sarabun New font failed to load. Please check your connection.');
 await doc.fonts.ready;
}
let canvasFonts:Promise<void>|undefined;
export function prepareReportCanvasFonts(){
 if(!canvasFonts)canvasFonts=(async()=>{
  const normal=new FontFace('TIS Report Sarabun','url("'+REG+'")',{weight:'400'});
  const bold=new FontFace('TIS Report Sarabun','url("'+BOLD+'")',{weight:'700'});
  const faces=await Promise.all([normal.load(),bold.load()]);
  for(const face of faces)document.fonts.add(face);
 })().catch(e=>{canvasFonts=undefined;throw e;});
 return canvasFonts;
}
export function configureReportFrame(iframe:HTMLIFrameElement){
 iframe.setAttribute('aria-hidden','true');
 iframe.setAttribute('scrolling','no');
 Object.assign(iframe.style,{position:'fixed',left:'0',top:'0',width:'1123px',minWidth:'1123px',maxWidth:'1123px',height:'1123px',minHeight:'1123px',border:'0',opacity:'0',pointerEvents:'none',background:'#ffffff'});
}
