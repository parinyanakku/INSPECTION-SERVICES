export type StoredRecord={key:string;value:string;parts?:readonly string[]};
export type RecordWrite={key:string;value:string|null;parts?:readonly string[]};
export function openSegmentedWorkspace(name:string):Promise<IDBDatabase>;
export function readSegmentedWorkspace(db:IDBDatabase):Promise<StoredRecord[]>;
export function writeSegmentedWorkspace(db:IDBDatabase,writes:readonly RecordWrite[]):Promise<void>;
