import { copyFile, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.dirname(fileURLToPath(import.meta.url));
const out=path.join(root,'dist');
await rm(out,{recursive:true,force:true});
await mkdir(path.join(out,'voice'),{recursive:true});
for(const name of ['index.html','app.js','core.js','companion-core.js','styles.css','sw.js','icon.svg','manifest.webmanifest']){
  await copyFile(path.join(root,name),path.join(out,name));
}
for(const name of await readdir(path.join(root,'voice'))){
  if(name.endsWith('.wav'))await copyFile(path.join(root,'voice',name),path.join(out,'voice',name));
}
