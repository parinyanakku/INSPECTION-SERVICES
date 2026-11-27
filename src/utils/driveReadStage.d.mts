export function isTransientReadError(error:unknown):boolean;
export function retryReadStage<T>(read:()=>Promise<T>,options:{signal:AbortSignal;wait:(ms:number)=>Promise<void>;onRetry?:()=>void;allowMissing?:boolean}):Promise<T>;
