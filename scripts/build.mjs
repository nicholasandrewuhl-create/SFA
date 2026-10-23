import {cpSync,mkdirSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const dest=join(root,'public');rmSync(dest,{force:true,recursive:true});mkdirSync(dest);
for(const file of ['index.html','styles.css','app.js','engine.js','cloudflare.js'])cpSync(join(root,file),join(dest,file));
cpSync(join(root,'data'),join(dest,'data'),{recursive:true});
console.log('Staged deployable static site in public/.');
