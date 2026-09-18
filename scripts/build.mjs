import { cp, mkdir, readdir, readFile, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const source = new URL('../public/', import.meta.url), output = new URL('../dist/', import.meta.url);
const files = await readdir(source, {recursive:true});
const hash = createHash('sha256');
const {version} = JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
hash.update(version);
for(const name of files.sort()) {
  if(name.endsWith('.js'))execFileSync(process.execPath,['--check',fileURLToPath(new URL(name,source))]);
  if(/\.[a-z]+$/.test(name))hash.update(await readFile(new URL(name,source)));
}
JSON.parse(await readFile(new URL('manifest.webmanifest',source),'utf8'));
for(const name of ['index.html','styles.css','theme.js','updates.js','app.js','db.js','model.js','visits.js','visit-model.js','icon.svg','icons/icon-192.png','icons/icon-512.png','icons/maskable-512.png'])await readFile(new URL(name,source));
await rm(output,{recursive:true,force:true});await mkdir(output,{recursive:true});await cp(source,output,{recursive:true});
const html=await readFile(new URL('index.html',output),'utf8');
await writeFile(new URL('index.html',output),html.replace('__APP_VERSION__',version));
const sw=await readFile(new URL('sw.js',source),'utf8');
await writeFile(new URL('sw.js',output),sw.replace('__BUILD_VERSION__',hash.digest('hex').slice(0,16)));
console.log('Built My health diary → dist. JavaScript and required offline assets verified.');
