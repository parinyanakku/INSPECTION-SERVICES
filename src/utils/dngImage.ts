// Decode camera DNG locally, in a lazily loaded Web Worker.
// Never upload the source RAW file or replace it on disk.
export function isDngFile(file:File){
  return /\.dng$/i.test(file.name)||/^(image\/(x-)?adobe-dng|image\/dng|image\/x-dng)$/i.test(file.type);
}
export function imageUploadError(file:File,lang:'th'|'en',fallback:string){
  if(!isDngFile(file))return fallback;
  return lang==='en'?'Unable to decode this DNG. It may be damaged, too large, or use an unsupported RAW format. Export the original as JPEG/PNG and try again.':'ไม่สามารถถอดรหัสไฟล์ DNG นี้ได้ ไฟล์อาจเสียหาย มีขนาดใหญ่ หรือใช้ RAW ที่ไม่รองรับ กรุณาส่งออกต้นฉบับเป็น JPEG/PNG แล้วลองใหม่';
}

type JpegCandidate={start:number;end:number;width:number;height:number};
function jpegAt(b:Uint8Array,start:number):JpegCandidate|null{
 let p=start+2,w=0,h=0,inScan=false,sawScan=false;
 while(p<b.length){
   if(inScan){
     p=b.indexOf(255,p);
     if(p<0)return null;
   }else if(b[p]!==255)return null;
   while(p<b.length&&b[p]===255)p++;
   if(p>=b.length)return null;
   const m=b[p++];
   if(inScan&&(m===0||(m>=208&&m<=215)))continue;
   inScan=false;
   if(m===217)return sawScan&&w&&h?{start,end:p,width:w,height:h}:null;
   if(m===216||m===0||(m>=208&&m<=215))return null;
   if(m===1)continue;
   if(p+2>b.length)return null;
   const n=b[p]*256+b[p+1];
   if(n<2||p+n>b.length)return null;
   if((m>=192&&m<=207)&&![196,200,204].includes(m)){
     // Only browser-displayable 8-bit sequential/progressive JPEG, never lossless RAW tiles.
     if(![192,193,194].includes(m)||n<8||b[p+2]!==8||![1,3].includes(b[p+7]))return null;
     h=b[p+3]*256+b[p+4];w=b[p+5]*256+b[p+6];
     if(Math.max(w,h)<1600||!w||!h||w*h>60000000)return null;
   }
   if(m===218){if(!w||!h)return null;inScan=true;sawScan=true;}
   p+=n;
 }
 return null;
}

// Apple ProRAW may contain a camera-rendered, full-size JPEG inside its DNG.
// Inspect complete JPEG streams, not just a thumbnail or lossless RAW tile.
async function findEmbeddedJpegs(file:File):Promise<JpegCandidate[]> {
  const b=new Uint8Array(await file.arrayBuffer());
  const result:JpegCandidate[]=[];
  for(let i=b.indexOf(255);i>=0&&i+2<b.length;i=b.indexOf(255,i+1)){
    if(b[i+1]!==216||b[i+2]!==255)continue;
    const candidate=jpegAt(b,i);
    if(candidate){result.push(candidate);i=candidate.end-1;}
  }
  return result.sort((a,b)=>b.width*b.height-a.width*a.height).slice(0,8);
}

function checkedJpeg(canvas:HTMLCanvasElement,quality:number):string{
  const probe=document.createElement('canvas');probe.width=32;probe.height=32;
  try{
    const pc=probe.getContext('2d');if(!pc)throw Error('Canvas unavailable');
    pc.drawImage(canvas,0,0,32,32);
    const samples=pc.getImageData(0,0,32,32).data;
    let max=0;
    for(let i=0;i<samples.length;i+=4)max=Math.max(max,samples[i],samples[i+1],samples[i+2]);
    // Never mark an all-black decoder result as a successful import.
    if(max<=2)throw Error('DNG conversion returned a blank black image');
    const jpeg=canvas.toDataURL('image/jpeg',quality);
    if(!jpeg.startsWith('data:image/jpeg;'))throw Error('DNG conversion failed');
    return jpeg;
  }finally{probe.width=1;probe.height=1;}
}

async function embeddedToJpeg(file:File,candidate:JpegCandidate,maxDimension:number,quality:number):Promise<string>{
  const url=URL.createObjectURL(file.slice(candidate.start,candidate.end,'image/jpeg'));
  const canvas=document.createElement('canvas');
  try{
    const img=await new Promise<HTMLImageElement>((resolve,reject)=>{
      const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(Error('Invalid embedded JPEG'));image.src=url;
    });
    const sw=img.naturalWidth,sh=img.naturalHeight;
    if(!sw||!sh||sw*sh>60_000_000||Math.max(sw,sh)<1600)throw Error('Invalid embedded JPEG dimensions');
    const scale=Math.min(1,(maxDimension>0?maxDimension:4096)/Math.max(sw,sh));
    canvas.width=Math.max(1,Math.round(sw*scale));canvas.height=Math.max(1,Math.round(sh*scale));
    const ctx=canvas.getContext('2d');if(!ctx)throw Error('Canvas unavailable');
    ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
    ctx.drawImage(img,0,0,canvas.width,canvas.height);
    return checkedJpeg(canvas,quality);
  }finally{URL.revokeObjectURL(url);canvas.width=1;canvas.height=1;}
}

export async function decodeDngToJpeg(file:File,maxDimension=2560,quality=0.95):Promise<string>{
  if(file.size>160*1024*1024)throw Error('DNG exceeds 160 MB limit');
  const previews=await findEmbeddedJpegs(file).catch(()=>[] as JpegCandidate[]);
  const target=Math.max(1600,maxDimension>0?maxDimension:4096);
  // Prefer camera-rendered JPEG at the required resolution. Smaller usable
  // previews are a fallback only, so a thumbnail never replaces RAW detail.
  for(const candidate of previews){
    if(Math.max(candidate.width,candidate.height)<target)continue;
    try{return await embeddedToJpeg(file,candidate,maxDimension,quality);}catch(error){console.warn('DNG embedded JPEG unavailable',error);}
  }
  try{return await decodeRawToJpeg(file,maxDimension,quality);}catch(error){
    console.warn('DNG RAW decoding failed; checking remaining embedded JPEGs',error);
    for(const candidate of previews){
      if(Math.max(candidate.width,candidate.height)>=target)continue;
      try{return await embeddedToJpeg(file,candidate,maxDimension,quality);}catch(previewError){console.warn('DNG preview unavailable',previewError);}
    }
    throw error;
  }
}

async function decodeRawToJpeg(file:File,maxDimension=2560,quality=0.95):Promise<string>{
  if(file.size>160*1024*1024)throw Error('DNG exceeds 160 MB limit');
  const {createWorkerPool}=await import('flashraw/worker');
  const pool=createWorkerPool({size:1});
  const controller=new AbortController();
  const timeout=window.setTimeout(()=>controller.abort(),90000);
  try{
    const raw=await pool.open(file);
    try{
      const count=raw.metadata.width*raw.metadata.height;
      if(!Number.isFinite(count)||count<=0||count>60_000_000)throw Error('Unsupported DNG dimensions');
      // Large 48MP photos can exhaust mobile memory; request a half-size
      // development when the sensor supports it. Smaller photos keep full detail.
      const frame=await raw.decode({output:'rgba8',demosaic:count>24_000_000?'half-size':'auto',previewFallback:true,signal:controller.signal});
      const sw=frame.width,sh=frame.height;
      if(!Number.isSafeInteger(sw)||!Number.isSafeInteger(sh)||sw<=0||sh<=0||sw*sh>60_000_000||frame.data.length!==sw*sh*4)throw Error('Invalid decoded DNG');
      if(frame.source==='preview'&&Math.max(sw,sh)<1600)throw Error('Embedded preview too small for inspection');
      const scale=Math.min(1,(maxDimension>0?maxDimension:4096)/Math.max(sw,sh));
      const w=Math.max(1,Math.round(sw*scale)),h=Math.max(1,Math.round(sh*scale));
      const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
      const ctx=canvas.getContext('2d');if(!ctx)throw Error('Canvas unavailable');
      // Limit intermediate canvases to stripes to avoid Safari's large-canvas limit.
      const pixels=new Uint8ClampedArray(frame.data.buffer,frame.data.byteOffset,frame.data.byteLength);
      const strip=document.createElement('canvas');strip.width=sw;strip.height=Math.min(sh,256);
      const sc=strip.getContext('2d');if(!sc)throw Error('Canvas unavailable');
      ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
      ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);
      for(let y=0;y<sh;y+=256){
        const rows=Math.min(256,sh-y);
        const block=new Uint8ClampedArray(pixels.subarray(y*sw*4,(y+rows)*sw*4));
        sc.putImageData(new ImageData(block,sw,rows),0,0);
        const top=Math.round(y*h/sh),bottom=Math.round((y+rows)*h/sh);
        if(bottom>top)ctx.drawImage(strip,0,0,sw,rows,0,top,w,bottom-top);
      }
      strip.width=1;strip.height=1;
      try{return checkedJpeg(canvas,quality);}finally{canvas.width=1;canvas.height=1;}
    }finally{if(!controller.signal.aborted)await raw.close().catch(()=>{});}
  }finally{window.clearTimeout(timeout);pool.terminate();}
}
