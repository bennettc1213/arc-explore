import {createCanvas, GlobalFonts, loadImage} from '@napi-rs/canvas';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import ffmpeg from 'ffmpeg-static';

const ROOT=path.dirname(fileURLToPath(import.meta.url));
process.chdir(ROOT);
GlobalFonts.registerFromPath('assets/SpaceGrotesk.ttf','Space');
GlobalFonts.registerFromPath('assets/IBMPlexMono.ttf','Plex');
const W=1080,H=1350,FPS=60,DURATION=60;
const C={bg:'#0a0a0b',surface:'#141416',surface2:'#1a1a1d',text:'#ededef',muted:'#96969e',orange:'#ff4d00',lite:'#ffa366',line:'#303034'};
const canvas=createCanvas(W,H), ctx=canvas.getContext('2d');
const feed=await loadImage('assets/feed.png');
const home=await loadImage('assets/home.png');
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const ease=v=>1-Math.pow(1-clamp(v),4);
const smooth=v=>{v=clamp(v);return v*v*(3-2*v)};
const lerp=(a,b,v)=>a+(b-a)*v;
const scenes=[
 {a:0,b:3,name:'a clearer next step',fn:intro},
 {a:3,b:8,name:'the scholarship gap',fn:stat},
 {a:8,b:11,name:'meet instela',fn:brand},
 {a:11,b:18,name:'discover',fn:discover},
 {a:18,b:24,name:'understand your fit',fn:match},
 {a:24,b:32,name:'prepare',fn:prepare},
 {a:32,b:38,name:'stay organized',fn:tracker},
 {a:38,b:42,name:'apply',fn:autofill},
 {a:42,b:49,name:'why pro',fn:pro},
 {a:49,b:56,name:'student pricing',fn:price},
 {a:56,b:60,name:'your next move',fn:closing},
];
function rect(x,y,w,h,fill,stroke){if(fill){ctx.fillStyle=fill;ctx.fillRect(x,y,w,h)}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1.5;ctx.strokeRect(x+.75,y+.75,w-1.5,h-1.5)}}
function line(x1,y1,x2,y2,color=C.line,width=2){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke()}
function text(s,x,y,size=30,color=C.text,weight=500,font='Space',align='left'){ctx.fillStyle=color;ctx.font=`${weight} ${size}px ${font}`;ctx.textBaseline='alphabetic';ctx.textAlign=align;ctx.fillText(s,x,y);ctx.textAlign='left'}
function mono(s,x,y,size=22,color=C.muted){text(s,x,y,size,color,400,'Plex')}
function block(lines,x,y,size=83,color=C.text,leading=1.05){lines.forEach((s,i)=>text(s,x,y+i*size*leading,size,color,650))}
function tag(s,x,y,active=false){ctx.font='400 20px Plex';let w=ctx.measureText(s).width+30;rect(x,y,w,40,active?'#30170e':C.surface,active?C.orange:C.line);mono(s,x+15,y+27,20,active?C.lite:C.muted);return w}
function check(x,y,s=20,color=C.orange,p=1){ctx.strokeStyle=color;ctx.lineWidth=s/7;ctx.lineCap='square';ctx.beginPath();ctx.moveTo(x,y+s*.5);if(p<.35){ctx.lineTo(x+s*.35*p/.35,y+s*(.5+.35*p/.35))}else{ctx.lineTo(x+s*.35,y+s*.85);ctx.lineTo(x+s*(.35+.65*(p-.35)/.65),y+s*(.85-.85*(p-.35)/.65))}ctx.stroke()}
function arrow(x,y,s=45,color=C.orange){line(x-s,y,x,y,color,3);line(x-s*.4,y-s*.4,x,y,color,3);line(x-s*.4,y+s*.4,x,y,color,3)}
function mascot(x,y,u=5,alpha=1,t=0,assembly=1){ctx.save();ctx.globalAlpha*=alpha;const rows=['...xxxx...','..xxxxxx..','..xxxxxx..','..xx.xxx..','..xxxxxx..','...xxxx...','..xxxxxx..','.xxxxxxxx.','.xxxxxxxx.','..xx..xx..'];for(let r=0;r<10;r++)for(let c=0;c<10;c++)if(rows[r][c]==='x'){const n=r*10+c;const p=ease((assembly-n*.002)/.55);const ox=(1-p)*Math.sin(n*4.2)*650;const oy=(1-p)*Math.cos(n*1.7)*600;rect(Math.round(x+c*u+ox),Math.round(y+r*u+oy),u+.2,u+.2,C.orange)}if(assembly>.75)rect(x+4*u,y+3*u,u,u,Math.sin(t*2.2)> .99?C.orange:C.lite);ctx.restore()}
function animated(t,delay,fn,d=.7){const p=ease((t-delay)/d);if(p<=0)return;ctx.save();ctx.globalAlpha*=p;ctx.translate(0,(1-p)*55);fn(p);ctx.restore()}
function panel(x,y,w,h,fn){ctx.save();rect(x,y,w,h,C.surface,C.line);ctx.translate(x,y);fn();ctx.restore()}
function header(kicker){mascot(66,55,3.4);text('instela.',113,84,33,C.text,650);text(kicker,1014,80,18,C.muted,400,'Plex','right');}
function footer(note=''){line(66,1255,1014,1255);mono(note,66,1294,19);mono('instela.org',868,1294,19,C.text)}
function label(s){line(66,160,95,160,C.orange,3);mono(s,110,168,22)}
const bg=createCanvas(W,H),bc=bg.getContext('2d');bc.fillStyle=C.bg;bc.fillRect(0,0,W,H);for(let y=130;y<1240;y+=32)for(let x=34;x<W;x+=32){bc.fillStyle='#202023';bc.fillRect(x,y,1.3,1.3)}
function background(t){ctx.drawImage(bg,0,0);const g=ctx.createRadialGradient(900+Math.sin(t*.12)*100,740,10,840,740,680);g.addColorStop(0,'#ff4d000a');g.addColorStop(1,'#ff4d0000');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);}

function intro(t){header('BUILT FOR YOUR NEXT MOVE');label('INTERNSHIPS + SCHOLARSHIPS');
 animated(t,0,()=>block(['your next move'],66,328,89));
 animated(t,.22,()=>block(['deserves more'],66,424,89));
 animated(t,.45,()=>block(['than more tabs.'],66,520,89,C.orange));
 const labels=['scholarships','deadlines','internships','eligibility','applications','requirements'];
 labels.forEach((s,i)=>{let x=85+(i%3)*309,y=725+Math.floor(i/3)*178;const p=ease((t-.45-i*.08)/.6),collapse=smooth((t-2.1)/.8);x=lerp(x,435,collapse);y=lerp(y,850,collapse);ctx.save();ctx.translate(x+145,y+65);ctx.rotate((1-collapse)*Math.sin(i*2.5)*.07);ctx.scale(p*(1-.7*collapse),p*(1-.7*collapse));ctx.globalAlpha=p*(1-.9*collapse);rect(-145,-65,290,130,C.surface,C.line);rect(-145,-65,290,27,C.surface2);for(let j=0;j<3;j++)rect(-129+j*13,-54,4,4,C.muted);mono(s,-122,0,19);line(-122,26,100,26);ctx.restore()});
 footer('find a clearer starting point');}

function stat(t){header('THE SCHOLARSHIP GAP');label('A REAL PROBLEM');
 const n=Math.round(40*ease(t/.95));text(`${n}%`,58,490,270,C.orange,650);
 animated(t,.25,()=>block(['of families didn’t use','scholarships to pay','for college.'],70,590,58));
 const lit=Math.round(40*ease((t-.2)/1.1));for(let r=0;r<5;r++)for(let c=0;c<20;c++){const i=r*20+c,p=ease((t-.35-i*.006)/.5);ctx.globalAlpha=p;rect(70+c*47,845+r*47,34,34,i<lit?C.orange:'#27272c')}ctx.globalAlpha=1;
 mono('40 OF 100 FAMILIES · 2024–25 ACADEMIC YEAR',70,1139,21,C.text);
 mono('SOURCE: SALLIE MAE / IPSOS, 2025',70,1182,21);
 footer('How America Pays for College · n = 2,000');}

function brand(t){header('A CLEARER WAY FORWARD');
 mascot(407,215,26,1,t,ease(t/1.2));
 animated(t,.35,()=>{text('use',66,760,178,C.orange,700);text('instela.',66,956,178,C.orange,700)});
 animated(t,.65,()=>{line(70,1032,1010,1032,C.orange,2);text('find. prepare. apply.',70,1114,48,C.text,500);arrow(1000,1098,45)});
 footer('your next chapter starts with a next step');}

function discover(t){header('01 / FIND');label('CHECKED AT THE SOURCE');
 animated(t,0,()=>{text(Math.round(50463*ease(t/1.1)).toLocaleString('en-US'),62,372,158,C.orange,650);text('opportunities found.',70,443,58,C.text,600);mono('ALL TIME · INCLUDES CLOSED LISTINGS',70,490,22)});
 const p=ease((t-.3)/.7);ctx.save();ctx.globalAlpha=p;ctx.translate(0,(1-p)*80);
 rect(66,545,948,523,C.surface,C.line);rect(66,545,948,44,C.surface2);mono('instela.org / explore',92,574,18,C.text);rect(974,563,10,10,C.orange);
 ctx.save();ctx.beginPath();ctx.rect(68,590,944,476);ctx.clip();const sy=lerp(425,955,smooth((t-1.1)/4.5));ctx.drawImage(feed,345,sy,1380,730,68,590,944,500);ctx.restore();ctx.restore();
 animated(t,1.15,()=>{const x=70;tag('internships',x,1101,true);tag('scholarships',280,1101,true);tag('college merit awards',520,1101,true)});
 animated(t,1.45,()=>text('Employer boards. Sponsor pages. Direct links.',70,1202,31,C.text));
 footer('Instela-reported total · captured Nov 15, 2026');}

function match(t){header('02 / UNDERSTAND YOUR FIT');label('SCOUT + DETAILED PRO GUIDANCE');
 animated(t,0,()=>block(['start with you.','see what fits.'],66,300,91));
 animated(t,.25,()=>{tag('your field',70,465,true);tag('your location',274,465);tag('your background',527,465)});
 const rows=[['01','your stated interests','compared with the listing'],['02','eligibility + requirements','conflicts and unknowns stay visible'],['03','skills to strengthen','see where your preparation has gaps']];
 rows.forEach((_,i)=>{const y=640+i*170,p=(t*.42+i*.31)%1;line(94,516,94,y,C.line,2);line(94,y,124,y,C.line,2);if(t>1){rect(90,lerp(516,y,p),8,8,C.orange)}});
 rows.forEach(([n,a,b],i)=>animated(t,.6+i*.24,()=>panel(66,566+i*170,948,147,()=>{mono(n,25,43,20,C.orange);text(a,92,58,35,C.text,600);text(b,92,106,27,C.muted);check(884,49,26,C.orange,ease((t-1-i*.3)/.3))})));
 animated(t,1.7,()=>{rect(66,1106,948,96,'#25150e','#6d2d13');text('know why a match made your list.',91,1166,36,C.lite,500)});
 footer('fit explains alignment; it does not predict selection');}

function docIcon(x,y,color=C.orange){rect(x,y,32,41,null,color);line(x+8,y+12,x+25,y+12,color,2);line(x+8,y+21,x+25,y+21,color,2);line(x+8,y+30,x+21,y+30,color,2)}
function prepare(t){header('03 / PREPARE');label('FIVE TOOLS. ONE PLACE.');
 animated(t,0,()=>block(['give your work','a stronger showing.'],66,296,80));
 const toolset=[['resume critique','spot ATS + completeness issues'],['cover letter drafts','edit a draft for the opportunity'],['GitHub audit + README','make your projects easier to read'],['LinkedIn check + builder','sharpen your headline and About'],['essay / SOP review','check coverage, clarity + structure']];
 const active=Math.min(4,Math.floor(Math.max(0,t-.7)/1.35)),phase=(Math.max(0,t-.7)%1.35)/1.35;
 animated(t,.15,()=>panel(66,466,948,355,()=>{
  // A document is inspected, edited and rebuilt as the tool changes.
  rect(24,24,389,305,C.bg,C.line);mono(['RESUME','COVER LETTER','README.md','LINKEDIN ABOUT','ESSAY DRAFT'][active],45,63,21,C.text);
  for(let j=0;j<7;j++){const width=[310,270,294,220,306,252,190][(j+active)%7],y=91+j*29,p=ease(phase*2-j*.065);rect(45,y,width*p,7,j===(active+2)%7?C.orange:'#45454d');}
  const scan=72+((t*100)%234);rect(27,scan,383,2,C.orange);rect(27,scan-23,383,23,'#ff4d0009');
  mono(`0${active+1} / 05`,451,64,23,C.orange);
  const copy=[['check the details.','ATS compatibility','completeness findings'],['start with a draft.','made for the opportunity','edit paragraph by paragraph'],['show the work.','profile + pin audit','build a clear README'],['make it readable.','headline + About builder','check your pasted profile'],['make your point.','prompt coverage + clarity','specificity + structure']][active];
  text(copy[0],451,122,35,C.text,600);
  copy.slice(1).forEach((s,i)=>{check(454,170+i*55,19);text(s,490,187+i*55,24,C.muted)});
  mono('TOOL WORKFLOW ILLUSTRATION',451,309,16,C.muted);
 }));
 toolset.forEach(([a],i)=>animated(t,.45+i*.12,()=>{const wide=i===4,x=66+(i%2)*486,y=854+Math.floor(i/2)*116,w=wide?948:462,on=active===i;rect(x,y,w,96,on?'#25150e':C.surface,on?C.orange:C.line);mono(`0${i+1}`,x+19,y+32,18,on?C.orange:C.muted);text(a,x+19,y+71,27,on?C.lite:C.text,550);if(on){rect(x,y+92,w*ease(phase*2),4,C.orange);if(wide)arrow(976,y+47,34)}}));
 footer('your experience is the material. you make the final edit.');}

function tracker(t){header('04 / FOLLOW THROUGH');label('APPLICATION TRACKER');
 animated(t,0,()=>block(['keep the next step','in sight.'],66,296,87));
 const labels=['saved','preparing','applied','decision'];
 labels.forEach((s,i)=>{const y=512+i*130,lit=t>.6+i*.55;rect(83,y,26,26,lit?C.orange:C.surface,lit?C.orange:C.line);if(i<3)line(96,y+31,96,y+127,C.line,2);text(s,144,y+29,40,lit?C.text:C.muted,600);mono(`0${i+1}`,900,y+25,23,lit?C.orange:C.muted)});
 const move=ease((t-1.1)/2.0);ctx.save();ctx.translate(440+Math.sin(move*Math.PI)*55,lerp(495,885,move));rect(0,0,420,105,C.surface2,C.orange);mono('YOUR NEXT OPPORTUNITY',20,34,18,C.lite);text(labels[Math.min(3,Math.floor(move*4))],20,79,31,C.text,600);check(365,41,22);ctx.restore();
 animated(t,2.4,()=>{rect(66,1100,948,100,'#21140e',C.line);text('Saved searches + alerts + weekly digest',90,1163,32,C.text,500)});
 footer('workflow illustration · no student outcome is implied');}

function autofill(t){header('05 / APPLY');label('AUTOFILL EXTENSION · BETA');
 animated(t,0,()=>block(['less retyping.','you stay in control.'],66,296,78));
 panel(66,484,948,537,()=>{mono('SUPPORTED APPLICATION FORMS',29,49,21);[['name','your saved name'],['school','your saved school'],['graduation year','your saved year']].forEach(([a,b],i)=>{const y=90+i*127;mono(a.toUpperCase(),30,y+6,18);rect(30,y+23,888,74,C.bg,C.line);const p=clamp((t-.55-i*.3)*2);text(b.slice(0,Math.ceil(p*b.length)),50,y+71,31,C.text);if(p===1)check(861,y+46,22)});});
 animated(t,1.5,()=>{text('review → answer gaps → submit yourself',70,1090,34,C.lite,500);mono('BETA · NOT YET VERIFIED END TO END',70,1161,23)});
 footer('motion illustration · supported forms only');}

function pro(t){header('INSTELA PRO');label('MORE ROOM TO KEEP GOING');
 animated(t,0,()=>block(['why go pro?'],66,303,106));
 const rows=[['ranked search results','top 20','every match'],['active applications','10','unlimited'],['each preparation tool','1 / 30 days','unlimited'],['saved-search alerts','weekly','daily']];
 mono('FREE',539,415,23);mono('PRO',786,415,23,C.orange);
 rows.forEach(([a,b,c],i)=>animated(t,.25+i*.18,()=>{const y=451+i*141;line(66,y,1014,y);text(a,70,y+44,29,C.text,550);mono(b,539,y+100,23);text(c,786,y+100,29,C.orange,650)}));
 animated(t,1.2,()=>{rect(66,1061,948,145,'#22140e','#6d2d13');text('+ detailed fit + gap guidance',91,1117,36,C.lite,550);text('+ timing-weighted ranking',91,1167,32,C.text,500)});
 footer('AI cover-letter generations: 30 per hour on every plan');}

function price(t){header('THE STUDENT OFFER');label('INSTELA PRO');
 animated(t,0,()=>{text('50%',58,492,259,C.orange,700);text('off for students.',70,589,79,C.text,600)});
 animated(t,.55,()=>{text('$20',75,730,75,C.muted,500);line(71,701,221,701,C.muted,5);mono('/ month',243,720,25);arrow(480,701,85)});
 animated(t,.9,()=>{text('$10',62,958,228,C.orange,650);text('/ month',526,941,50,C.text,500)});
 animated(t,1.3,()=>{rect(66,1022,948,166,C.surface,C.line);mono('VERIFY YOUR .EDU EMAIL',91,1065,25,C.text);text('+ current student enrollment',91,1112,35,C.text,500);mono('Eligibility and checkout terms apply.',91,1157,22)});
 footer('regular Pro: $20/month · eligible students: $10/month');}

function closing(t){header('YOUR NEXT MOVE');
 mascot(824,207,14,1,t);
 animated(t,0,()=>block(['find it.','prepare for it.','go for it.'],66,384,105));
 animated(t,.35,()=>text('use instela.',60,930,157,C.orange,700));
 animated(t,.6,()=>{rect(66,1011,948,120,C.orange);text('start exploring free',95,1088,48,C.bg,650);arrow(970,1069,48,C.bg);mono('instela.org',70,1200,30,C.text)});
 footer('built for the student figuring out what comes next');}

function render(t){ctx.resetTransform();ctx.globalAlpha=1;background(t);const idx=scenes.findIndex(s=>t>=s.a&&t<s.b);const s=scenes[idx<0?scenes.length-1:idx];const local=t-s.a;
 // The edit crosses each section on a continuous, directional page turn.
 const enter=ease(local/.48);ctx.save();ctx.globalAlpha=Math.min(1,local/.18);ctx.translate((1-enter)*60,0);s.fn(local);ctx.restore();
 // Twelve square markers make the cadence visible without adding UI clutter.
 const total=DURATION;rect(0,0,W*t/total,4,C.orange);for(let i=0;i<scenes.length;i++){let x=66+i*86;rect(x,1231,scenes[i]===s?36:8,4,scenes[i]===s?C.orange:'#37373d')}
 // Staggered orange shutters, confined to the cut itself.
 if(local<.3&&s.a>0){for(let j=0;j<6;j++){const p=clamp((local-j*.012)/.17);rect(W*p,j*225,W*(1-p),225,j%2?C.bg:C.orange)}}
}

function makeMusic(){
 const sr=48000,n=sr*DURATION,data=new Float32Array(n*2);let seed=181;
 const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296*2-1};
 function add(start,dur,fn,pan=0){const a=Math.floor(start*sr),len=Math.floor(dur*sr);for(let j=0;j<len&&a+j<n;j++){const v=fn(j/sr,j/len);data[(a+j)*2]+=v*Math.sqrt((1-pan)*.5);data[(a+j)*2+1]+=v*Math.sqrt((1+pan)*.5)}}
 const freq=m=>440*Math.pow(2,(m-69)/12), tau=Math.PI*2;
 const chords=[[45,52,57,60,64],[41,48,53,57,60],[48,55,60,64,67],[43,50,55,59,62]];
 // A composed 120 BPM instrumental: warm minor-ninth pads, restrained
 // analog pulses, dry percussion; no sampled or licensed recordings.
 for(let bar=0;bar<30;bar++){
  const time=bar*2,chord=chords[Math.floor(bar/2)%4];
  chord.forEach((m,i)=>add(time,3,(t,p)=>{const env=Math.min(1,t/1)*Math.min(1,(1-p)*3);return .022*env*(Math.sin(tau*freq(m)*t)+.25*Math.sin(tau*freq(m)*1.003*t))},(i-2)*.3));
  const energy=time<8?.52:time<11?.35:time<49?.9:time<56?.7:.68;
  for(let beat=0;beat<4;beat++){
   const ts=time+beat*.5;
   add(ts,.29,(t)=>energy*.43*Math.sin(tau*(48*t+7*(1-Math.exp(-30*t))))*Math.exp(-t*18));
   if(beat%2===1)add(ts,.18,(t)=>energy*(.095*rnd()*Math.exp(-t*35)+.065*Math.sin(tau*180*t)*Math.exp(-t*32)),.08);
   if(time>=10)for(let h=0;h<2;h++)add(ts+h*.25,.055,t=>energy*.036*rnd()*Math.exp(-t*85),(h?-.35:.35));
   add(ts,.39,t=>energy*.085*(Math.sin(tau*freq(chord[0]-12)*t)+.13*Math.sin(tau*freq(chord[0])*t))*Math.exp(-t*9));
  }
  if(time>=10)for(let k=0;k<8;k++){const m=chord[[0,2,4,3,1,2,3,4][k]]+12;add(time+k*.25,.48,(t)=>energy*.048*(Math.sin(tau*freq(m)*t)+.14*Math.sin(tau*freq(m)*2*t))*Math.exp(-t*10),Math.sin(k*1.3)*.6)}
 }
 for(const s of scenes.slice(1)){add(s.a-.15,.42,(t,p)=>.034*rnd()*Math.pow(Math.sin(p*Math.PI),2),-.2);add(s.a,.6,t=>.06*Math.sin(tau*freq(81)*t)*Math.exp(-t*12),.3)}
 // Gentle shared saturation, stereo preservation, edit-friendly end.
 let peak=0,sum=0;for(let i=0;i<n;i++){const env=clamp(i/sr/.6)*clamp((DURATION-i/sr)/1.2);for(let c=0;c<2;c++){const ix=i*2+c;data[ix]=Math.tanh(data[ix]*1.25)*.8*env;peak=Math.max(peak,Math.abs(data[ix]));sum+=data[ix]*data[ix]}}
 const wav=Buffer.alloc(44+n*4);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(2,22);wav.writeUInt32LE(sr,24);wav.writeUInt32LE(sr*4,28);wav.writeUInt16LE(4,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(n*4,40);for(let i=0;i<data.length;i++)wav.writeInt16LE(Math.round(clamp(data[i],-1,1)*32767),44+i*2);fs.writeFileSync('assets/score.wav',wav);console.log('Original score',{peak:peak.toFixed(3),rms:Math.sqrt(sum/(n*2)).toFixed(3)});
}

if(process.argv.includes('--preview')){
 const times=[1.6,5.6,9.5,15,21,28,35.8,40,46,53,58.4];
 const sheet=createCanvas(1080,Math.ceil(times.length/3)*486),sc=sheet.getContext('2d');sc.fillStyle='#212124';sc.fillRect(0,0,sheet.width,sheet.height);
 for(let i=0;i<times.length;i++){render(times[i]);fs.writeFileSync(`assets/preview-${i+1}.png`,canvas.toBuffer('image/png'));sc.drawImage(canvas,(i%3)*360,Math.floor(i/3)*486,360,450);sc.fillStyle='#ededef';sc.font='18px Space';sc.fillText(`${times[i]}s · ${scenes[i].name}`,(i%3)*360+12,Math.floor(i/3)*486+476)}
 fs.writeFileSync('storyboard.png',sheet.toBuffer('image/png'));render(58.4);fs.writeFileSync('instela-poster.png',canvas.toBuffer('image/png'));console.log('Storyboard and poster saved.');
}else{
 makeMusic();
 const out='instela-linkedin-1080x1350-60fps.mp4';
 const proc=spawn(ffmpeg,['-y','-hide_banner','-loglevel','warning','-f','rawvideo','-pixel_format','rgba','-video_size',`${W}x${H}`,'-framerate',String(FPS),'-i','pipe:0','-i','assets/score.wav','-map','0:v:0','-map','1:a:0','-c:v','libx264','-preset','medium','-crf','16','-pix_fmt','yuv420p','-r','60','-c:a','aac','-b:a','320k','-af','loudnorm=I=-16:TP=-1.5:LRA=8','-ar','48000','-t',String(DURATION),'-movflags','+faststart','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709','-metadata','title=Instela | Your next move','-metadata','comment=Original motion design and original instrumental. Source notes supplied alongside video.',out],{stdio:['pipe','ignore','pipe']});
 let err='';proc.stderr.on('data',d=>{err+=d;process.stderr.write(d)});proc.stdin.on('error',e=>console.error('encoder input:',e.message));
 const done=new Promise((resolve,reject)=>proc.on('close',code=>code===0?resolve():reject(new Error(`ffmpeg ${code}: ${err}`))));
 const started=Date.now();for(let f=0;f<DURATION*FPS;f++){render(f/FPS);const raw=canvas.data();if(!proc.stdin.write(raw))await once(proc.stdin,'drain');if(f%300===0){const msg=`${f}/${DURATION*FPS} frames · ${((Date.now()-started)/1000).toFixed(1)}s elapsed`;console.log(msg);fs.appendFileSync('render-progress.log',msg+'\n')}}proc.stdin.end();await done;console.log('DONE',out,fs.statSync(out).size);
}
