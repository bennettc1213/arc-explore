import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import ffmpeg from 'ffmpeg-static';
const name='instela-linkedin-1080x1350-60fps.mp4';
function run(args){const r=spawnSync(ffmpeg,args,{encoding:'utf8',maxBuffer:12*1024*1024});if(r.status!==0)throw new Error(r.stderr);return r.stderr;}
console.log(run(['-y','-hide_banner','-loglevel','warning','-i',name,'-i','assets/score.wav','-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','320k','-af','loudnorm=I=-16:TP=-1.5:LRA=8','-ar','48000','-t','60','-movflags','+faststart','-metadata','title=Instela | Your next move','-metadata','comment=Original motion design and original instrumental. Sources supplied alongside video.','final-48k.mp4']));
fs.renameSync('final-48k.mp4',name);
const metadata=run(['-hide_banner','-i',name,'-map','0:v:0','-map','0:a:0','-f','null','-']);
fs.writeFileSync('verification.txt',metadata);
console.log(metadata.slice(0,2200));console.log(metadata.slice(-650));
console.log(run(['-y','-hide_banner','-loglevel','warning','-ss','1','-i',name,'-vf','fps=1/5,scale=270:338,tile=4x3:padding=6:margin=6:color=0x202024','-frames:v','1','encoded-contact-sheet.jpg']));
const sound=run(['-hide_banner','-i',name,'-vn','-af','loudnorm=I=-16:TP=-1.5:LRA=8:print_format=json','-f','null','-']);fs.writeFileSync('audio-verification.txt',sound);console.log(sound.slice(-700));
console.log('FINAL BYTES',fs.statSync(name).size);
