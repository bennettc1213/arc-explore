import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import ffmpeg from 'ffmpeg-static';
const file='widescreen/instela-widescreen-1920x1080-60fps.mp4';
function run(args){const r=spawnSync(ffmpeg,args,{encoding:'utf8',maxBuffer:20*1024*1024});if(r.status!==0)throw new Error(r.stderr);return r.stderr;}
const meta=run(['-hide_banner','-i',file,'-map','0:v:0','-map','0:a:0','-f','null','-']);
if(!meta.includes('1920x1080')||!meta.includes('60 fps')||!meta.includes('48000 Hz')||!meta.includes('00:01:12.00')||!meta.match(/frame=\s*4320/))throw new Error('Unexpected output metadata / frame count');
fs.writeFileSync('widescreen/verification.txt',meta);
const selected=[1.95,6.1,9.95,14.1,21.1,26.95,31.1,37.1,42.1,49.1,53.6,58.1,64.1,70.6].map(t=>`eq(n,${Math.round(t*60)})`).join('+');
run(['-y','-hide_banner','-loglevel','warning','-i',file,'-vf',`select='${selected}',scale=480:270,tile=3x5:padding=6:margin=6:color=0x202024`,'-frames:v','1','-update','1','widescreen/encoded-contact-sheet.jpg']);
const audio=run(['-hide_banner','-i',file,'-vn','-af','loudnorm=I=-16:TP=-2.5:LRA=8:print_format=json','-f','null','-']);fs.writeFileSync('widescreen/audio-verification.txt',audio);
const json=JSON.parse(audio.slice(audio.lastIndexOf('{'),audio.lastIndexOf('}')+1));
if(Number(json.input_tp)>0)throw new Error('Audio exceeds full scale');
const delivery={durationSeconds:72,width:1920,height:1080,aspectRatio:'16:9',fps:60,frames:4320,videoCodec:'H.264 High / yuv420p / Rec.709',audio:'AAC-LC stereo / 48 kHz / 320 kb/s',bytes:fs.statSync(file).size,measuredLUFS:Number(json.input_i),measuredTruePeakDBTP:Number(json.input_tp),fullDecode:'passed'};
fs.writeFileSync('widescreen/delivery.json',JSON.stringify(delivery,null,2)+'\n');console.log(delivery);
