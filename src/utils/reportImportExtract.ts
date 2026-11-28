// Local text extraction; the original document is not modified or persisted.
export const MAX_SOURCE_CHARS=80000;
export const MAX_SOURCE_BYTES=25*1024*1024;
function bounded(parts:string[]){const s=parts.join('\n').trim();if(!s)throw Error('NO_DOCUMENT_TEXT');if(s.length>MAX_SOURCE_CHARS)throw Error('SOURCE_TOO_LONG');return s;}
export async function extractReportSource(file:File):Promise<string>{
 if(!file.size||file.size>MAX_SOURCE_BYTES)throw Error('FILE_SIZE');
 const ext=file.name.split('.').pop()?.toLowerCase();
 if(ext==='pdf'){
  const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
  const worker=await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc=worker.default;
  const task=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,useSystemFonts:true,enableXfa:false});
  try{
   const doc=await task.promise;if(doc.numPages>100)throw Error('TOO_MANY_PAGES');
   const parts:string[]=[];let count=0;let hasText=false;
   for(let i=1;i<=doc.numPages;i++){
    const page=await doc.getPage(i);try{
     const c=await page.getTextContent();
     const s=c.items.map(item=>'str'in item?item.str+(item.hasEOL?'\n':' '):'').join('').trim();
     if(s)hasText=true;
     const piece='[Page '+i+']\n'+(s||'[No extractable text]');parts.push(piece);count+=piece.length+1;
     if(count>MAX_SOURCE_CHARS)throw Error('SOURCE_TOO_LONG');
    }finally{page.cleanup();}
   }
   if(!hasText)throw Error('NO_DOCUMENT_TEXT');
   return bounded(parts);
  }finally{await task.destroy();}
 }
 if(ext==='docx'){
  const {default:JSZip}=await import('jszip');const zip=await JSZip.loadAsync(await file.arrayBuffer());
  const entry=zip.file('word/document.xml');if(!entry)throw Error('INVALID_DOCX');
  const uncompressed=(entry as any)._data?.uncompressedSize;if(typeof uncompressed==='number'&&uncompressed>10*1024*1024)throw Error('SOURCE_TOO_LONG');
  const xml=await entry.async('string');if(xml.length>10*1024*1024)throw Error('SOURCE_TOO_LONG');
  if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('INVALID_DOCX');
  const doc=new DOMParser().parseFromString(xml,'application/xml');
  if(doc.getElementsByTagName('parsererror').length)throw Error('INVALID_DOCX');
  const ns='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const parts=Array.from(doc.getElementsByTagNameNS(ns,'p')).map(p=>Array.from(p.getElementsByTagNameNS(ns,'t')).map(n=>n.textContent||'').join('')).filter(Boolean);
  return bounded(parts);
 }
 if(ext==='xlsx'){
  const XLSX=await import('xlsx');
  const book=XLSX.read(await file.arrayBuffer(),{type:'array',sheetRows:2001,cellFormula:false,cellHTML:false,bookVBA:false});
  if(book.SheetNames.length>20)throw Error('TOO_MANY_SHEETS');
  const parts:string[]=[];let count=0,hasText=false;
  for(const name of book.SheetNames){
   const sheet=book.Sheets[name];if(!sheet)continue;
   const ref=sheet['!fullref']||sheet['!ref'];if(!ref)continue;
   const range=XLSX.utils.decode_range(ref);
   if(range.e.r-range.s.r>=2000||range.e.c-range.s.c>=100)throw Error('SOURCE_TOO_LONG');
   const csv=XLSX.utils.sheet_to_csv(sheet,{blankrows:false,strip:true});
   if(csv.trim())hasText=true;
   const piece='[Sheet '+name+']\n'+csv;parts.push(piece);count+=piece.length+1;if(count>MAX_SOURCE_CHARS)throw Error('SOURCE_TOO_LONG');
  }
  if(!hasText)throw Error('NO_DOCUMENT_TEXT');return bounded(parts);
 }
 throw Error('UNSUPPORTED_FILE');
}
