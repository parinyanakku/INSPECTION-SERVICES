// Byte index: skip image payloads without storing them in memory.
export function createImageIndexScanner(limit=8*1024*1024){
 const prefix='"data:image/',out=new Uint8Array(limit),ranges=[];
 let length=0,offset=0,start=0,mode=0,escaped=false,head=[];
 function append(b){if(length>=limit)throw Error('Project text index exceeds safe size');out[length++]=b;}
 function feed(bytes){
  for(let i=0;i<bytes.length;){
   const b=bytes[i];
   if(mode===0){if(b===34){mode=1;head=[34];start=offset+i;}else append(b);i++;continue;}
   if(mode===1){head.push(b);i++;if(String.fromCharCode(b).toLowerCase()===prefix[head.length-1]){if(head.length===prefix.length){mode=3;head=[];escaped=false;}}else{for(const x of head)append(x);head=[];mode=b===34?0:2;escaped=b===92;}continue;}
   if(mode===2){append(b);i++;if(escaped){escaped=false;continue;}if(b===92)escaped=true;else if(b===34)mode=0;continue;}
   if(escaped){escaped=false;i++;continue;}
   const q=bytes.indexOf(34,i),slash=bytes.indexOf(92,i),next=q<0?slash:slash<0?q:Math.min(q,slash);
   if(next<0){i=bytes.length;continue;}i=next+1;
   if(bytes[next]===92){escaped=true;continue;}
   const id=ranges.length;ranges.push({start,end:offset+next});
   for(const c of '"tis-drive-image:'+id+'"')append(c.charCodeAt(0));mode=0;
  }offset+=bytes.length;
 }
 function finish(){if(mode!==0)throw Error('Incomplete JSON string');return {bytes:out.slice(0,length),ranges,total:offset};}
 return {feed,finish};
}
