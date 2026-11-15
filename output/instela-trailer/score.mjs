import fs from 'node:fs';
export function makeScore({duration,scenes,path}){
 const sr=48000,n=sr*duration,data=new Float32Array(n*2);let seed=181;
 const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296*2-1};
 function add(start,dur,fn,pan=0){const a=Math.floor(start*sr),len=Math.floor(dur*sr);for(let j=0;j<len&&a+j<n;j++){const v=fn(j/sr,j/len);data[(a+j)*2]+=v*Math.sqrt((1-pan)*.5);data[(a+j)*2+1]+=v*Math.sqrt((1+pan)*.5)}}
 const freq=m=>440*2**((m-69)/12),tau=Math.PI*2,chords=[[45,52,57,60,64],[41,48,53,57,60],[48,55,60,64,67],[43,50,55,59,62]];
 for(let bar=0;bar<Math.ceil(duration/2);bar++){
  const time=bar*2,chord=chords[Math.floor(bar/2)%4],energy=time<8?.52:time<11?.35:time<61?.9:time<68?.7:.68;
  chord.forEach((m,i)=>add(time,3,(t,p)=>.022*Math.min(1,t)*Math.min(1,(1-p)*3)*(Math.sin(tau*freq(m)*t)+.25*Math.sin(tau*freq(m)*1.003*t)),(i-2)*.3));
  for(let beat=0;beat<4;beat++){const ts=time+beat*.5;add(ts,.29,t=>energy*.43*Math.sin(tau*(48*t+7*(1-Math.exp(-30*t))))*Math.exp(-t*18));if(beat%2)add(ts,.18,t=>energy*(.095*rnd()*Math.exp(-t*35)+.065*Math.sin(tau*180*t)*Math.exp(-t*32)),.08);if(time>=10)for(let h=0;h<2;h++)add(ts+h*.25,.055,t=>energy*.036*rnd()*Math.exp(-t*85),h?-.35:.35);add(ts,.39,t=>energy*.085*(Math.sin(tau*freq(chord[0]-12)*t)+.13*Math.sin(tau*freq(chord[0])*t))*Math.exp(-t*9));}
  if(time>=10)for(let k=0;k<8;k++){const m=chord[[0,2,4,3,1,2,3,4][k]]+12;add(time+k*.25,.48,t=>energy*.048*(Math.sin(tau*freq(m)*t)+.14*Math.sin(tau*freq(m)*2*t))*Math.exp(-t*10),Math.sin(k*1.3)*.6)}
 }
 for(const s of scenes.slice(1)){add(s.a-.15,.42,(t,p)=>.034*rnd()*Math.sin(p*Math.PI)**2,-.2);add(s.a,.6,t=>.06*Math.sin(tau*freq(81)*t)*Math.exp(-t*12),.3)}
 let peak=0;for(let i=0;i<n;i++){const env=clamp(i/sr/.6)*clamp((duration-i/sr)/1.2);for(let c=0;c<2;c++){const ix=i*2+c;data[ix]=Math.tanh(data[ix]*1.25)*.8*env;peak=Math.max(peak,Math.abs(data[ix]))}}
 const wav=Buffer.alloc(44+n*4);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(2,22);wav.writeUInt32LE(sr,24);wav.writeUInt32LE(sr*4,28);wav.writeUInt16LE(4,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(n*4,40);for(let i=0;i<data.length;i++)wav.writeInt16LE(Math.round(clamp(data[i],-1,1)*32767),44+i*2);fs.writeFileSync(path,wav);console.log('Original score generated; peak:',peak.toFixed(3));
}
