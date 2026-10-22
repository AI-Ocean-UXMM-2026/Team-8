from pathlib import Path
import sys,subprocess
from PIL import Image,ImageDraw,ImageFont
sys.path.insert(0,'/tmp/parcelcare-pitch-tools')
import imageio_ffmpeg
D=Path(__file__).resolve().parent
FONT='/System/Library/Fonts/Supplemental/Arial.ttf'
BOLD='/System/Library/Fonts/Supplemental/Arial Bold.ttf'
def font(n,b=False):return ImageFont.truetype(BOLD if b else FONT,n)
phases=[
 (20,'01','Reported','100 sent. 95 recorded.','The same case: WR-2001 / IN-0081','Evidence reference: delivery receipt IN-0081','01-reported.png'),
 (30,'02','Investigated','One case. Clear ownership.','Priority, review and case status are separate.','Missing data stays visible; no guessed priority.','02-investigated.png'),
 (25,'03','Rule checks','A safe handoff for review.','This demo uses deterministic rule-based checks.','AI direction: summarize, flag gaps, suggest next steps.','02-investigated.png'),
 (20,'04','Manager proposal','A decision with a written reason.','A demo proposal is sent to the SME.','No physical recount or stock correction is claimed.','03-manager-review.png'),
 (15,'05','SME confirmation','Only the SME closes the report.','The recorded agreement stays in case history.','Report closure does not prove the five items were found.','05-confirmed.png')]
W,H=1920,770
proc=subprocess.Popen([imageio_ffmpeg.get_ffmpeg_exe(),'-y','-loglevel','error','-f','rawvideo','-vcodec','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r','2','-i','-','-an','-c:v','libx264','-preset','fast','-crf','20','-pix_fmt','yuv420p','-r','24','-movflags','+faststart',str(D/'ParcelCare-Demo-Walkthrough.mp4')],stdin=subprocess.PIPE)
elapsed=0
for duration,n,stage,title,line1,line2,name in phases:
 shot=Image.open(D/'assets'/name).convert('RGB');shot.thumbnail((420,590))
 for f in range(duration*2):
  img=Image.new('RGB',(W,H),'#FFFFFF');dr=ImageDraw.Draw(img)
  dr.text((65,48),'PARCELCARE  /  RECEIVING EXCEPTION',font=font(22,True),fill='#087A86')
  dr.rounded_rectangle((65,132,141,206),radius=18,fill='#FFC738');dr.text((85,148),n,font=font(34,True),fill='#17383E')
  dr.text((164,151),stage.upper(),font=font(25,True),fill='#087A86')
  import textwrap
  y=265
  for line in textwrap.wrap(title,34):dr.text((65,y),line,font=font(53,True),fill='#17383E');y+=66
  for k,t in enumerate([line1,line2]):
   for j,line in enumerate(textwrap.wrap(t,64)):dr.text((65,y+45+k*92+j*34),line,font=font(27),fill='#567077')
  x=1470+(420-shot.width)//2;img.paste(shot,(x,108))
  dr.rectangle((65,692,1850,700),fill='#DBE7E9');dr.rectangle((65,692,65+int(1785*(elapsed+f/2)/110),700),fill='#1FC3CD')
  dr.text((65,724),'EDITED SCREEN WALKTHROUGH · FICTITIOUS DATA · RULE-BASED CHECKS · NO NARRATION',font=font(18),fill='#567077')
  dr.text((1760,724),f'{int(elapsed+f/2):02d} / 110s',font=font(18),fill='#567077')
  if elapsed==0 and f==0:img.save(D/'assets/video-cover.png')
  proc.stdin.write(img.tobytes())
 elapsed+=duration
proc.stdin.close();code=proc.wait();assert code==0
print('Created 110-second edited screenshot walkthrough (not continuous screen capture).')
