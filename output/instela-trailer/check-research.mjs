import fs from 'node:fs';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
for(const name of ['timing-slides','timing-paper']){
 if(!fs.existsSync(`assets/${name}.pdf`))continue;
 const doc=await getDocument({data:new Uint8Array(fs.readFileSync(`assets/${name}.pdf`)),useSystemFonts:true}).promise;
 let out='';for(let i=1;i<=doc.numPages;i++){const p=await doc.getPage(i),c=await p.getTextContent();out+=`\nPAGE ${i}\n`+c.items.map(x=>x.str).join(' ')+'\n'}
 fs.writeFileSync(`assets/${name}-text.txt`,out);
 console.log(name,'pages',doc.numPages);
 for(const match of out.matchAll(/.{0,180}(?:1\.16|0\.40|first.half|internship|percentage points).{0,250}/gi))console.log(match[0]);
}
