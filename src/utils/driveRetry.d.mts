export function isRetryableDriveStatus(status:number):boolean;
export function retryDriveRead(request:()=>Promise<Response>,wait:(ms:number)=>Promise<void>,signal?:AbortSignal|null,maxAttempts?:number):Promise<Response>;
