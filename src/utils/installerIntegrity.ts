export async function verifyInstallerDigest(file:Blob,expected:string):Promise<boolean>{
 if(!/^[a-f0-9]{64}$/.test(expected)||file.size<8||file.size>20*1024*1024)return false;
 const digest=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());
 return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('')===expected;
}
