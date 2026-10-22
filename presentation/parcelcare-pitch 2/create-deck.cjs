const pptxgen = require('pptxgenjs');
const fs = require('fs');
const path = require('path');
const D=__dirname, data=require('./content.json');
const p=new pptxgen();p.layout='LAYOUT_WIDE';p.author='ParcelCare · Team-8';p.subject='Five-minute pitch and honest demo narrative';p.title='ParcelCare — From shipment problems to verified resolutions';p.company='Team-8';p.lang='en-GB';
p.theme={headFontFace:'Arial',bodyFontFace:'Arial',lang:'en-GB'};
const C={ink:'17383E',muted:'567077',cyan:'1FC3CD',dark:'087A86',pale:'EAF9FA',yellow:'FFC738',light:'F5F8F9',line:'DBE7E9',white:'FFFFFF'};
const logo=path.resolve(D,'../../public/brand/parcelcare-logo.png');
const shape=p.ShapeType;
function text(s,t,x,y,w,h,size=20,extra={}){s.addText(t,{x,y,w,h,fontFace:'Arial',fontSize:size,color:C.ink,margin:0,breakLine:false,vertAlign:'mid',...extra})}
function rect(s,x,y,w,h,fill=C.light,line=fill){s.addShape(shape.roundRect,{x,y,w,h,rectRadius:.12,radius:.12,fill:{color:fill},line:{color:line,width:.8}})}
function base(n,kicker,title){const s=p.addSlide();s.background={color:C.white};s.addImage({path:logo,x:.6,y:.26,w:1.8,h:.6});text(s,kicker.toUpperCase(),.65,1.02,11,.22,11,{bold:true,color:C.dark,charSpacing:1.4});text(s,title,.65,1.48,12.05,1.12,34,{bold:true,vertAlign:'top',breakLine:false});text(s,'PARCELCARE  /  TEAM-8',.65,7.08,6,.18,9,{color:C.muted});text(s,String(n).padStart(2,'0')+' / 07',11.65,7.04,1,.24,10,{align:'right',color:C.muted});s.addNotes(data.notes[n-1]);return s}
function small(s,t,x,y,w){text(s,t,x,y,w,.6,14,{color:C.muted,vertAlign:'top',breakLine:false})}
function arrow(s,x,y,w=.45){text(s,'→',x,y,w,.4,24,{color:C.dark,align:'center'})}
let s=base(1,'The moment of pain','100 items sent. 95 recorded.');
text(s,'Who resolves the missing five?',.65,2.45,11.8,.55,28,{color:C.dark,bold:true});
const nums=[['100','ITEMS SENT'],['95','ITEMS RECORDED'],['?','UNRESOLVED GAP']];
nums.forEach(([v,l],i)=>{const x=.65+i*4.2;rect(s,x,3.45,3.6,2.1,i===2?'FFF5D7':C.pale);text(s,v,x+.3,3.66,3,1.02,70,{bold:true,color:i===2?C.ink:C.dark});text(s,l,x+.3,4.92,3,.25,12,{bold:true,color:C.muted});if(i<2)arrow(s,x+3.65,4.14,.5)});
small(s,'From shipment problems to verified resolutions.',.65,6.08,10);text(s,'Illustrative scenario · not a customer testimonial',.65,6.62,11,.2,11,{color:C.muted});
s=base(2,'Problem','One exception. Multiple\ndisconnected conversations.');
const steps=['SME message','Warehouse count','Receipt / photo','Manager decision'];steps.forEach((t,i)=>{let x=.65+i*3.17;rect(s,x,3.02,2.73,.9,C.light);text(s,t,x+.18,3.28,2.37,.3,18,{bold:true});if(i<3)arrow(s,x+2.77,3.26,.36)});
[['01','Slow investigation','Evidence is scattered.'],['02','Unclear ownership','The next action is uncertain.'],['03','Uncertain closure','SMEs keep following up.']].forEach(([n,t,b],i)=>{let x=.65+i*4.2;text(s,n,x,4.5,1,.45,25,{bold:true,color:C.dark});text(s,t,x,5.15,3.8,.4,23,{bold:true});small(s,b,x,5.78,3.65)});
s=base(3,'Solution','One shared case.\nA clear next action.');
['Report','Investigate','Review','SME decision','Verified resolution'].forEach((t,i)=>{let x=.65+i*2.53;rect(s,x,3.05,2.15,.9,i===4?'FFF5D7':C.pale);text(s,t,x+.14,3.25,1.87,.47,17,{bold:true});if(i<4)arrow(s,x+2.18,3.3,.3)});
text(s,'AI assistance',.65,4.52,3.5,.4,24,{bold:true});text(s,'Summarize known facts\nFlag missing information\nSuggest a next action',.65,5.1,5.8,1.05,20,{breakLine:false,paraSpaceAfterPt:8});
rect(s,7.15,4.42,5.45,1.9,C.light);text(s,'Recommendation ≠ approval',7.45,4.73,4.85,.4,23,{bold:true});small(s,'Human decisions and physical verification remain separate.',7.45,5.34,4.72);text(s,'AI capability direction · the following demo uses rule-based checks.',.65,6.58,12,.24,12,{color:C.muted});
s=base(4,'Product demo · 1 minute 50 seconds','One issue, from report to confirmation.');
// A real-UI screenshot montage is embedded, clearly distinguished from continuous capture.
if(fs.existsSync(path.join(D,'ParcelCare-Demo-Walkthrough.mp4'))){s.addImage({path:path.join(D,'assets/video-cover.png'),x:.65,y:2.8,w:9.35,h:3.75});s.addMedia({type:'video',path:path.join(D,'ParcelCare-Demo-Walkthrough.mp4'),cover:'image/png;base64,'+fs.readFileSync(path.join(D,'assets/video-cover.png')).toString('base64'),x:.65,y:2.8,w:9.35,h:3.75});}
else {s.addImage({path:path.join(D,'assets/02-investigated.png'),...p.imageSizingContain(path.join(D,'assets/02-investigated.png'),.65,2.8,9.35,3.75)});}
text(s,'WR-2001',10.35,3.05,2.3,.35,24,{bold:true,color:C.dark});text(s,'IN-0081',10.35,3.55,2.3,.28,16,{color:C.muted});text(s,'Reported\nInvestigated\nReviewed\nConfirmed',10.35,4.12,2.3,1.8,19,{breakLine:false,paraSpaceAfterPt:15});
text(s,'Edited screen walkthrough · fictitious data · rule-based checks · click video to play',.65,6.7,12,.2,10,{color:C.muted});
s=base(5,'Impact + business model','The warehouse pays.\nEvery connected SME benefits.');
rect(s,.65,3,5.7,2.7,C.pale);text(s,'B2B SaaS subscription',.98,3.34,5.04,.4,26,{bold:true,color:C.dark});text(s,'Per warehouse site, per month\nSME collaboration included\nLater: integrations + onboarding support',.98,4.1,4.98,1.19,19,{breakLine:false});
text(s,'The value to validate',7,3.15,5.6,.4,24,{bold:true});text(s,'Less staff time spent chasing\nFaster, traceable decisions\nClearer communication with SMEs',7,3.88,5.55,1.22,20,{breakLine:false});
text(s,'Paying sites × monthly subscription = recurring revenue',.65,6.02,12,.4,22,{bold:true});text(s,'Pricing hypothesis · no measured revenue or time-saving claim',.65,6.64,12,.22,11,{color:C.muted});
s=base(6,'Proposed 12-month roadmap','Prove value first. Expand next.');
const phases=[['01','MONTHS 1–3','Validate','Interviews + pilot partner\nBaseline handling time'],['02','MONTHS 4–6','Prove','Pilot feedback + iteration\nResolution time + willingness to pay'],['03','MONTHS 7–12','Grow','Paid sites + operator referrals\nTargeted demos + partnerships']];
phases.forEach(([n,tm,t,b],i)=>{let x=.65+i*4.2;rect(s,x,3,3.8,2.7,i===2?'FFF5D7':C.light);text(s,tm,x+.25,3.3,3.3,.28,12,{bold:true,color:C.dark});text(s,t,x+.25,3.9,3.3,.48,29,{bold:true});small(s,b,x+.25,4.65,3.25)});
text(s,'Measure monthly',.65,6.02,2.1,.3,17,{bold:true});text(s,'Active sites · staff engagement · resolution time · SME confirmation · paid conversion · support effort',2.9,6.03,9.6,.53,14,{color:C.muted});text(s,'Research targets · not achieved traction',.65,6.71,12,.2,10,{color:C.muted});
s=base(7,'The outcome + our ask','Less chasing.\nClearer accountability.');
rect(s,.65,3.12,5.7,2.25,C.light);text(s,'BEFORE',.98,3.45,5,.24,12,{bold:true,color:C.muted});text(s,'Scattered messages\nUnclear ownership\nRepeated follow-ups',.98,4,5.02,1.05,21,{breakLine:false});
rect(s,6.65,3.12,5.95,2.25,C.pale);text(s,'AFTER',6.98,3.45,5.25,.24,12,{bold:true,color:C.dark});text(s,'One case + visible evidence\nAssigned responsibility\nRecorded confirmation',6.98,4,5.25,1.05,21,{breakLine:false});
text(s,'Seeking warehouse pilot partners',.65,5.91,11.8,.52,28,{bold:true,color:C.dark});small(s,'Validate the workflow. Measure the value.',.65,6.54,11);
p.writeFile({fileName:path.join(D,'ParcelCare-5-Minute-Pitch.pptx')});
