import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const [platform, file] = process.argv.slice(2);
const ext = {windows:'msi', android:'apk'}[platform];
if (!ext || !process.env.PROELITE_UPLOAD_URL) throw Error('A candidate upload grant is required');
const url = new URL(process.env.PROELITE_UPLOAD_URL);
const prefix = '/storage/v1/object/upload/sign/proelite-installers/candidates/' + platform + '/';
if (url.origin !== 'https://geleptwbxjoumxyxbhqa.supabase.co' ||
    !url.pathname.startsWith(prefix) || !/^[a-zA-Z0-9_-]+\.(apk|msi)$/.test(url.pathname.slice(prefix.length)) ||
    !url.pathname.endsWith('.' + ext) || !url.searchParams.get('token')) throw Error('Invalid candidate upload grant');
const bytes = await readFile(file);
const result = await fetch(url, {method:'PUT', redirect:'error', headers:{'Content-Type':'application/octet-stream','cache-control':'0'}, body:bytes});
if (!result.ok) throw Error('Private staging failed (HTTP ' + result.status + ')');
console.log('Staged', platform, 'SHA-256', createHash('sha256').update(bytes).digest('hex'));
