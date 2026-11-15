import {createCanvas,GlobalFonts,loadImage} from '@napi-rs/canvas';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import ffmpeg from 'ffmpeg-static';
import {makeScore} from './score.mjs';
process.chdir(path.dirname(fileURLToPath(import.meta.url)));
fs.mkdirSync('widescreen',{recursive:true});
GlobalFonts.registerFromPath('assets/SpaceGrotesk.ttf','Space');GlobalFonts.registerFromPath('assets/IBMPlexMono.ttf','Plex');
const W=1920,H=1080,FPS=60,DURATION=72;
const C={bg:'#0a0a0b',panel:'#141416',raised:'#1a1a1d',text:'#ededef',muted:'#96969e',orange:'#ff4d00',lite:'#ffa366',line:'#303034'};
const canvas=createCanvas(W,H),ctx=canvas.getContext('2d'),feed=await loadImage('assets/feed.png');
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));const ease=v=>1-(1-clamp(v))**4;const smooth=v=>{v=clamp(v);return v*v*(3-2*v)};const lerp=(a,b,v)=>a+(b-a)*v;
const overflow=new Set();
function rect(x,y,w,h,fill,stroke){if(fill){ctx.fillStyle=fill;ctx.fillRect(x,y,w,h)}if(stroke){ctx.lineWidth=1.5;ctx.strokeStyle=stroke;ctx.strokeRect(x+.75,y+.75,w-1.5,h-1.5)}}
function line(x,y,a,b,color=C.line,width=2){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(a,b);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke()}
function text(s,x,y,size=32,color=C.text,weight=500,font='Space',align='left'){ctx.font=`${weight} ${size}px ${font}`;ctx.fillStyle=color;ctx.textBaseline='alphabetic';ctx.textAlign=align;const width=ctx.measureText(s).width,left=align==='right'?x-width:x,m=ctx.getTransform(),worldLeft=m.a*left+m.c*y+m.e,worldRight=m.a*(left+width)+m.c*y+m.e;if(ctx.globalAlpha>.1&&(worldLeft<25||worldRight>1895))overflow.add(s);ctx.fillText(s,x,y);ctx.textAlign='left'}
function mono(s,x,y,size=22,color=C.muted){text(s,x,y,size,color,400,'Plex')}
function block(lines,x,y,size=84,color=C.text,lead=1.1){lines.forEach((s,i)=>text(s,x,y+i*size*lead,size,color,650))}
function wrap(s,x,y,width,size=30,color=C.text,weight=500,font='Space'){ctx.font=`${weight} ${size}px ${font}`;let row='',n=0;for(const word of s.split(' ')){const next=row?row+' '+word:word;if(ctx.measureText(next).width>width&&row){text(row,x,y+n*size*1.35,size,color,weight,font);n++;row=word}else row=next}if(row)text(row,x,y+n*size*1.35,size,color,weight,font);return(n+1)*size*1.35}
function animated(t,d,fn,dur=.6){const p=ease((t-d)/dur);if(p===0)return;ctx.save();ctx.globalAlpha*=p;ctx.translate(0,(1-p)*45);fn(p);ctx.restore()}
function tag(s,x,y,active=false,size=21){ctx.font=`400 ${size}px Plex`;const w=ctx.measureText(s).width+34;rect(x,y,w,46,active?'#30170e':C.panel,active?C.orange:C.line);mono(s,x+17,y+31,size,active?C.lite:C.muted);return w}
function check(x,y,size=22,color=C.orange){line(x,y+size*.45,x+size*.35,y+size*.85,color,3);line(x+size*.35,y+size*.85,x+size,y,color,3)}
function arrow(x,y,size=42,color=C.orange){line(x-size,y,x,y,color,3);line(x-size*.4,y-size*.4,x,y,color,3);line(x-size*.4,y+size*.4,x,y,color,3)}
function mascot(x,y,u=5,t=0,assembly=1){const rows=['...xxxx...','..xxxxxx..','..xxxxxx..','..xx.xxx..','..xxxxxx..','...xxxx...','..xxxxxx..','.xxxxxxxx.','.xxxxxxxx.','..xx..xx..'];for(let r=0;r<10;r++)for(let c=0;c<10;c++)if(rows[r][c]==='x'){const n=r*10+c,p=ease((assembly-n*.002)/.6);rect(Math.round(x+c*u+(1-p)*Math.sin(n*4.2)*900),Math.round(y+r*u+(1-p)*Math.cos(n*1.7)*700),u+.15,u+.15,C.orange)}if(assembly>.75)rect(x+4*u,y+3*u,u,u,Math.sin(t*2.2)>.99?C.orange:C.lite)}
function header(s){mascot(96,50,4);text('instela.',150,85,40,C.text,650);text(s,1824,81,23,C.muted,400,'Plex','right')}
function eyebrow(s){line(96,155,131,155,C.orange,3);mono(s,149,163,23)}
function footer(s){line(96,1007,1824,1007);mono(s,96,1046,20);text('instela.org',1824,1046,21,C.text,400,'Plex','right')}
const bg=createCanvas(W,H),bc=bg.getContext('2d');bc.fillStyle=C.bg;bc.fillRect(0,0,W,H);for(let y=128;y<980;y+=34)for(let x=28;x<W;x+=34){bc.fillStyle='#202023';bc.fillRect(x,y,1.2,1.2)}
function background(t){ctx.drawImage(bg,0,0);const g=ctx.createRadialGradient(1480+Math.sin(t*.12)*150,670,20,1480,670,850);g.addColorStop(0,'#ff4d000b');g.addColorStop(1,'#ff4d0000');ctx.fillStyle=g;ctx.fillRect(0,0,W,H)}
const scenes=[
 {a:0,b:3,name:'your next move',fn:intro},
 {a:3,b:8,name:'39% of students',fn:gap},
 {a:8,b:11,name:'why instela',fn:why},
 {a:11,b:18,name:'freshness and timing',fn:timing},
 {a:18,b:25,name:'smaller scholarship pools',fn:competition},
 {a:25,b:28,name:'use instela',fn:brand},
 {a:28,b:34,name:'source checked discovery',fn:discover},
 {a:34,b:39,name:'understand your fit',fn:fit},
 {a:39,b:46,name:'five preparation tools',fn:prepare},
 {a:46,b:51,name:'application tracker',fn:tracker},
 {a:51,b:55,name:'autofill beta',fn:autofill},
 {a:55,b:61,name:'why pro',fn:pro},
 {a:61,b:68,name:'student pricing',fn:price},
 {a:68,b:72,name:'start exploring',fn:closing},
];
function intro(t){header('BUILT FOR YOUR NEXT MOVE');eyebrow('INTERNSHIPS + SCHOLARSHIPS');
 animated(t,0,()=>block(['your next move'],96,350,105));animated(t,.2,()=>block(['deserves more'],96,466,105));animated(t,.4,()=>block(['than more tabs.'],96,582,105,C.orange));
 ['scholarships','internships','deadlines','eligibility','applications','requirements'].forEach((s,i)=>{const p=ease((t-.3-i*.06)/.6),co=smooth((t-2.15)/.7);let x=1140+(i%2)*328,y=320+Math.floor(i/2)*170;x=lerp(x,1420,co);y=lerp(y,525,co);ctx.save();ctx.translate(x+155,y+65);ctx.rotate((1-co)*Math.sin(i*2.3)*.065);ctx.scale(p*(1-co*.6),p*(1-co*.6));ctx.globalAlpha*=1-co*.9;rect(-155,-65,310,130,C.panel,C.line);rect(-155,-65,310,28,C.raised);for(let j=0;j<3;j++)rect(-139+j*14,-54,4,4,C.muted);mono(s,-132,10,21);line(-132,34,115,34);ctx.restore()});
 animated(t,.8,()=>text('find a clearer starting point.',100,806,39,C.muted));footer('for students figuring out what comes next');}
function gap(t){header('THE SCHOLARSHIP GAP');eyebrow('A STUDENT-SPECIFIC FINDING');
 text(`${Math.round(39*ease(t/.9))}%`,80,530,300,C.orange,650);animated(t,.2,()=>block(['of students didn’t use','scholarships to pay for college.'],102,641,57));
 const lit=Math.round(39*ease((t-.2)/1));for(let r=0;r<10;r++)for(let c=0;c<10;c++){const i=r*10+c;ctx.globalAlpha=ease((t-.35-i*.004)/.4);rect(1210+c*54,259+r*54,40,40,i<lit?C.orange:'#27272c')}ctx.globalAlpha=1;
 animated(t,.8,()=>{mono('39 OF 100 STUDENTS · 2024–25',103,850,24,C.text);mono('100% − 61% REPORTING SCHOLARSHIP USE',103,896,21)});
 footer('Sallie Mae / Ipsos · How America Pays for College 2025 · table 5 · students n = 1,000');}
function why(t){header('THE REASON TO USE IT');eyebrow('WHY INSTELA');
 animated(t,0,()=>text('why instela?',86,415,166,C.orange,700));
 animated(t,.25,()=>text('find it while it’s fresh. find what actually fits.',100,514,57,C.text,550));
 [['01','freshness','source checks + visible timestamps'],['02','relevance','field, location + eligibility'],['03','follow-through','prepare, track + keep moving']].forEach(([n,a,b],i)=>animated(t,.4+i*.12,()=>{const x=96+i*590;line(x,655,x+520,655,C.line);mono(n,x,704,24,C.orange);text(a,x,779,50,C.text,600);text(b,x,837,28,C.muted)}));
 footer('a clearer search starts with better information');}
function timing(t){header('WHY INSTELA / FRESHNESS');eyebrow('EARLIER APPLICATIONS CAN GET MORE ATTENTION');
 animated(t,0,()=>{text('~'+Math.round(5*ease(t/.9))+'%',85,432,235,C.orange,650);text('higher employer-contact rate',102,500,49,C.text,600)});
 animated(t,.3,()=>block(['for earlier applications.','+1.16 percentage points.'],102,600,49));
 animated(t,.5,()=>{mono('RELATIVE TO THE STUDY’S AVERAGE CONTACT RATE',103,758,21,C.lite);mono('EARLIER HALF VS. LATER HALF OF SUBMISSIONS',103,806,21)});
 // Sequence illustration: no made-up contact percentages or offer counts.
 const ox=1070,oy=309;mono('APPLICATION ORDER',ox,260,22,C.muted);
 for(let i=0;i<8;i++){const x=ox+(i%4)*190,y=oy+Math.floor(i/4)*221,p=ease((t-.5-i*.08)/.6);ctx.save();ctx.globalAlpha*=p;ctx.translate(0,(1-p)*60);rect(x,y,157,166,C.panel,i<4?C.orange:C.line);mono(String(i+1).padStart(2,'0'),x+18,y+35,20,i<4?C.orange:C.muted);for(let j=0;j<4;j++)rect(x+18,y+65+j*17,110-j*10,5,i<4?'#797981':'#44444b');ctx.restore()}
 mono('EARLIER HALF',ox,500,21,C.lite);mono('LATER HALF',ox,720,21,C.muted);
 animated(t,1.25,()=>{rect(96,876,1728,79,'#25150e','#6d2d13');text('Instela: source checks → clear timestamps → daily Pro alerts',122,928,35,C.lite,500)});
 footer('Sai Zhang / USC working paper, 2026 · job contacts; not internship offers or measured Instela uplift');}
function competition(t){header('WHY INSTELA / LOOK BEYOND THE BIGGEST AWARDS');eyebrow('A REAL SMALL-POOL EXAMPLE');
 animated(t,0,()=>block(['not every award','draws thousands.'],96,302,82));
 animated(t,.25,()=>{text((8.75*ease((t-.2)/1)).toFixed(2)+'%',88,661,184,C.orange,650);text('historical award rate',102,728,45,C.text,600)});
 animated(t,.6,()=>{mono('IAC SCHOLARSHIP · IDAHO · 2025',102,806,23,C.lite);text('Explore awards tied to your field or community.',102,858,32,C.muted)});
 const lit=Math.round(7*ease((t-.5)/.8));for(let r=0;r<8;r++)for(let c=0;c<10;c++){const i=r*10+c;ctx.globalAlpha=ease((t-.35-i*.006)/.5);rect(1170+c*53,245+r*53,38,38,i<lit?C.orange:'#28282e')}ctx.globalAlpha=1;
 animated(t,.8,()=>{text('7',1158,810,125,C.orange,650);text('selected from',1254,795,34,C.muted);text('80',1515,810,125,C.text,650);mono('APPLICANTS · $1,000 PER RECIPIENT',1170,863,21,C.text)});
 animated(t,1,()=>text('Eligibility: county-employee / elected-official families; full-time enrollment.',102,946,27,C.muted));
 footer('Source: Idaho Association of Counties · 7 ÷ 80 = 8.75% · example, not personal odds; Instela has no applicant counts');}
function brand(t){header('YOUR NEXT MOVE, WITH DIRECTION');
 mascot(1430,312,29,t,ease(t/1.2));animated(t,.25,()=>text('use instela.',82,559,215,C.orange,700));
 animated(t,.55,()=>{line(100,665,1260,665,C.orange,2);text('find. prepare. apply.',100,763,65,C.text,550);arrow(1250,740,58)});footer('built for students. built around the next step.');}
function discover(t){header('01 / FIND');eyebrow('CHECKED AT THE SOURCE');
 animated(t,0,()=>{text(Math.round(50463*ease(t/1)).toLocaleString('en-US'),86,398,166,C.orange,650);block(['opportunities','found, all time.'],102,489,64);mono('INCLUDES CLOSED LISTINGS',103,660,23)});
 animated(t,.5,()=>{tag('internships',103,737,true);tag('scholarships',332,737,true);tag('college merit awards',103,804,false)});
 const p=ease((t-.25)/.6);ctx.save();ctx.globalAlpha*=p;ctx.translate(0,(1-p)*70);rect(894,235,930,655,C.panel,C.line);rect(894,235,930,47,C.raised);mono('instela.org / explore',920,267,20,C.text);rect(1784,253,10,10,C.orange);ctx.save();ctx.beginPath();ctx.rect(896,283,926,605);ctx.clip();ctx.drawImage(feed,345,lerp(425,950,smooth((t-1)/4)),1380,770,896,283,926,605);ctx.restore();ctx.restore();
 animated(t,1,()=>text('Employer boards. Sponsor pages. Direct links.',900,946,32,C.text,500));footer('Instela-reported all-time total · product capture: Nov 15, 2026');}
function fit(t){header('02 / UNDERSTAND YOUR FIT');eyebrow('SCOUT + DETAILED PRO GUIDANCE');
 animated(t,0,()=>block(['start with you.','see what fits.'],96,335,91));
 animated(t,.3,()=>{tag('your field',100,570,true);tag('your location',324,570);tag('your background',100,637)});
 animated(t,.7,()=>text('know why a match made your list.',103,850,40,C.lite,550));
 [['01','your stated interests','compared with the listing'],['02','eligibility + requirements','conflicts and unknowns stay visible'],['03','skills to strengthen','see where your preparation has gaps']].forEach(([n,a,b],i)=>animated(t,.45+i*.2,()=>{const y=245+i*213;rect(1000,y,824,178,C.panel,C.line);mono(n,1027,y+44,22,C.orange);text(a,1095,y+70,36,C.text,600);text(b,1095,y+124,27,C.muted);check(1772,y+44,24)}));
 footer('fit explains alignment with available evidence; it does not predict selection');}
function prepare(t){header('03 / PREPARE');eyebrow('FIVE TOOLS. ONE PLACE.');
 animated(t,0,()=>block(['give your work','a stronger showing.'],96,295,77));
 const tools=['resume critique','cover letter drafts','GitHub audit + README','LinkedIn check + builder','essay / SOP review'],active=Math.min(4,Math.floor(Math.max(0,t-.5)/1.2)),phase=Math.max(0,t-.5)%1.2/1.2;
 tools.forEach((s,i)=>animated(t,.25+i*.1,()=>{const y=461+i*95,on=active===i;rect(96,y,713,79,on?'#25150e':C.panel,on?C.orange:C.line);mono('0'+(i+1),116,y+31,19,on?C.orange:C.muted);text(s,170,y+51,31,on?C.lite:C.text,550);if(on){rect(96,y+75,713*ease(phase*2),4,C.orange);arrow(778,y+39,25)}}));
 animated(t,.2,()=>{rect(910,235,914,676,C.panel,C.line);mono('PREPARE / '+String(active+1).padStart(2,'0'),944,286,22,C.orange);
  rect(944,318,420,537,C.bg,C.line);mono(['RESUME','COVER LETTER','README.md','LINKEDIN ABOUT','ESSAY DRAFT'][active],969,363,23,C.text);
  for(let j=0;j<11;j++){const widths=[320,278,340,240,310,285,190],p=ease(phase*2.3-j*.045);rect(970,400+j*35,widths[(j+active)%7]*p,7,j===(active+3)%11?C.orange:'#45454d')}
  const scan=389+(t*130)%423;rect(947,scan-25,414,25,'#ff4d0009');rect(947,scan,414,2,C.orange);
  const copy=[['check the details.','ATS compatibility','completeness findings'],['start with a draft.','made for the opportunity','edit paragraph by paragraph'],['show the work.','profile + pin audit','build a clear README'],['make it readable.','headline + About builder','check your pasted profile'],['make your point.','prompt coverage + clarity','specificity + structure']][active];
  wrap(copy[0],1407,405,355,38,C.text,600);copy.slice(1).forEach((s,i)=>{check(1408,520+i*110,21);wrap(s,1447,541+i*110,320,27,C.muted)});mono('WORKFLOW ILLUSTRATION',1407,831,18);
 });footer('your experience is the material. you make the final edit.');}
function tracker(t){header('04 / FOLLOW THROUGH');eyebrow('APPLICATION TRACKER');
 animated(t,0,()=>block(['keep the next step in sight.'],96,316,95));
 const labels=['saved','preparing','applied','decision'];labels.forEach((s,i)=>{const x=210+i*475,on=t>.5+i*.45;if(i<3)line(x+20,502,x+455,502,C.line,2);rect(x-13,489,26,26,on?C.orange:C.panel,on?C.orange:C.line);text(s,x-38,586,39,on?C.text:C.muted,600);mono('0'+(i+1),x-14,453,22,on?C.orange:C.muted)});
 const p=ease((t-.9)/2.2);ctx.save();ctx.translate(lerp(100,1425,p),656-Math.sin(p*Math.PI)*25);rect(0,0,390,125,C.raised,C.orange);mono('YOUR NEXT OPPORTUNITY',22,37,19,C.lite);text(labels[Math.min(3,Math.floor(p*4))],22,92,39,C.text,600);check(340,62,25);ctx.restore();
 animated(t,1.9,()=>{rect(96,857,1728,82,'#21140e',C.line);text('Saved searches + deadline reminders + alerts + weekly digest',124,911,38,C.text,500)});footer('workflow illustration · no student outcome is implied');}
function autofill(t){header('05 / APPLY');eyebrow('AUTOFILL EXTENSION · BETA');
 animated(t,0,()=>block(['less retyping.','you stay in control.'],96,330,83));
 animated(t,.4,()=>{text('review → answer gaps',102,672,40,C.lite,500);text('→ submit yourself',102,733,40,C.lite,500);mono('NOT YET VERIFIED END TO END',103,852,23)});
 rect(1010,238,814,656,C.panel,C.line);mono('SUPPORTED APPLICATION FORMS',1042,290,23);[['name','your saved name'],['school','your saved school'],['graduation year','your saved year']].forEach(([a,b],i)=>{const y=348+i*162;mono(a.toUpperCase(),1044,y,20);rect(1042,y+26,749,91,C.bg,C.line);const p=clamp((t-.5-i*.3)*2);text(b.slice(0,Math.ceil(p*b.length)),1066,y+84,35,C.text);if(p===1)check(1739,y+56,24)});footer('motion illustration · supported forms only');}
function pro(t){header('INSTELA PRO');eyebrow('MORE ROOM TO KEEP GOING');
 animated(t,0,()=>{text('why go pro?',90,324,104,C.text,650);text('stay ready for the next one.',100,402,45,C.muted)});
 animated(t,.5,()=>{rect(96,581,550,269,'#25150e','#6d2d13');block(['detailed fit','+ gap guidance'],124,646,44,C.lite);text('timing-weighted ranking',124,797,33,C.text,500)});
 mono('FREE',1315,268,24);mono('PRO',1575,268,24,C.orange);
 [['ranked search results','top 20','every match'],['active applications','10','unlimited'],['each preparation tool','1 / 30 days','unlimited'],['saved-search alerts','weekly','daily']].forEach(([a,b,c],i)=>animated(t,.25+i*.15,()=>{const y=310+i*155;line(742,y,1824,y);text(a,746,y+45,31,C.text,550);mono(b,1315,y+103,24);text(c,1575,y+103,31,C.orange,650)}));
 footer('AI cover-letter generations: 30 per hour on every plan');}
function price(t){header('THE STUDENT OFFER');eyebrow('INSTELA PRO');
 animated(t,0,()=>{text('50%',80,495,270,C.orange,700);text('off for students.',100,602,78,C.text,650)});
 animated(t,.4,()=>{text('$20',1080,362,92,C.muted,500);line(1073,329,1265,329,C.muted,5);mono('/ month',1295,353,29);arrow(1665,329,130)});
 animated(t,.8,()=>{text('$10',1055,655,251,C.orange,650);text('/ month',1545,632,56,C.text,500)});
 animated(t,1.15,()=>{rect(96,755,1728,171,C.panel,C.line);mono('VERIFY YOUR .EDU EMAIL',126,804,27,C.text);text('+ current student enrollment',126,866,42,C.text,550);text('Eligibility and checkout terms apply.',1785,861,27,C.muted,400,'Plex','right')});
 footer('regular Pro: $20/month · eligible students: $10/month');}
function closing(t){header('YOUR NEXT MOVE');mascot(1510,252,27,t);
 animated(t,0,()=>block(['find it. prepare for it.','go for it.'],96,338,96));
 animated(t,.25,()=>text('use instela.',87,672,165,C.orange,700));
 animated(t,.5,()=>{rect(96,788,1728,140,C.orange);text('start exploring free',132,879,63,C.bg,650);text('instela.org',1475,872,42,C.bg,600);arrow(1775,854,54,C.bg)});footer('built for the student figuring out what comes next');}
function render(t){ctx.resetTransform();ctx.globalAlpha=1;background(t);const scene=scenes.find(s=>t>=s.a&&t<s.b)??scenes.at(-1),local=t-scene.a;ctx.save();ctx.globalAlpha=Math.min(1,local/.16);ctx.translate((1-ease(local/.42))*65,0);scene.fn(local);ctx.restore();rect(0,0,W*t/DURATION,4,C.orange);scenes.forEach((s,i)=>rect(96+i*125,982,s===scene?37:8,4,s===scene?C.orange:'#37373d'));if(local<.26&&scene.a>0)for(let j=0;j<6;j++){const p=clamp((local-j*.01)/.16);rect(W*p,j*180,W*(1-p),180,j%2?C.bg:C.orange)}}
if(process.argv.includes('--preview')){
 const sheet=createCanvas(1440,Math.ceil(scenes.length/3)*302),sc=sheet.getContext('2d');sc.fillStyle='#212124';sc.fillRect(0,0,sheet.width,sheet.height);
 scenes.forEach((s,i)=>{const t=s.a+Math.min(3.1,(s.b-s.a)*.65);render(t);fs.writeFileSync(`widescreen/preview-${i+1}.png`,canvas.toBuffer('image/png'));sc.drawImage(canvas,i%3*480,Math.floor(i/3)*302,480,270);sc.font='18px Space';sc.fillStyle=C.text;sc.fillText(`${t.toFixed(1)}s · ${s.name}`,i%3*480+9,Math.floor(i/3)*302+294)});
 fs.writeFileSync('widescreen/storyboard.png',sheet.toBuffer('image/png'));render(70.6);fs.writeFileSync('widescreen/instela-cover-1920x1080.png',canvas.toBuffer('image/png'));console.log('Text overflow:',[...overflow]);
}else{
 makeScore({duration:DURATION,scenes,path:'widescreen/score.wav'});
 const out='widescreen/instela-widescreen-1920x1080-60fps.mp4';
 const proc=spawn(ffmpeg,['-y','-hide_banner','-loglevel','warning','-thread_queue_size','64','-f','rawvideo','-pixel_format','rgba','-video_size',`${W}x${H}`,'-framerate',String(FPS),'-i','pipe:0','-i','widescreen/score.wav','-map','0:v:0','-map','1:a:0','-c:v','libx264','-preset','medium','-crf','15','-pix_fmt','yuv420p','-r','60','-c:a','aac','-b:a','320k','-af','loudnorm=I=-16:TP=-2.5:LRA=8','-ar','48000','-t',String(DURATION),'-movflags','+faststart','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709','-metadata','title=Instela | Why Instela | Widescreen','-metadata','comment=Research context is distinguished from Instela product results. Sources supplied with video.',out],{stdio:['pipe','ignore','pipe']});
 let err='';proc.stderr.on('data',d=>{err+=d;process.stderr.write(d)});proc.stdin.on('error',e=>console.error(e.message));const done=new Promise((resolve,reject)=>proc.on('close',c=>c===0?resolve():reject(new Error(err))));
 const start=Date.now();for(let f=0;f<DURATION*FPS;f++){render(f/FPS);if(!proc.stdin.write(canvas.data()))await once(proc.stdin,'drain');if(f%360===0)console.log(`${f}/${DURATION*FPS} frames · ${((Date.now()-start)/1000).toFixed(1)} seconds elapsed`)}proc.stdin.end();await done;console.log('DONE',out,fs.statSync(out).size,'bytes');console.log('Text overflow:',[...overflow]);
}
