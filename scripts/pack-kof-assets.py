"""Pack original GIF animation frames into transparent PNG atlases; pixels are preserved."""
from pathlib import Path
import json,sys
from PIL import Image
source=Path(sys.argv[1]);target=Path('public/assets/kof');target.mkdir(parents=True,exist_ok=True)
manifest={'source':'https://github.com/oosuhada/retro-king-of-fighters','sourceCommit':'656732a0adc50a3bb17fae112283c4a8bcb86879','characters':{},'stage':None}
def pack(path,name,anchor=None):
 im=Image.open(path);w,h=im.size;frames=[];durations=[]
 for i in range(im.n_frames):
  im.seek(i);frames.append(im.convert('RGBA').copy());durations.append(max(20,im.info.get('duration',80)))
 columns=min(12,len(frames));rows=(len(frames)+columns-1)//columns
 atlas=Image.new('RGBA',(columns*w,rows*h))
 for i,frame in enumerate(frames):atlas.paste(frame,((i%columns)*w,(i//columns)*h))
 atlas.save(target/(name+'.png'))
 box=frames[0].getbbox() or (0,0,w,h)
 return {'file':name+'.png','width':w,'height':h,'columns':columns,'frames':len(frames),'durations':durations,'anchorX':(box[0]+box[2])/2,'anchorY':box[3],'footY':[(f.getbbox() or box)[3] for f in frames]}
for char in ['kyo','mai']:
 mapping={'idle':'0.gif','approach':'1.gif','retreat':'2.gif','jump':'3.gif','hurt':'5.gif','ko':'6.gif','punch':'attacks/stand-a.gif','kick':'attacks/stand-d.gif','special':'attacks/special-projectile.gif','block':'attacks/crouch-a.gif'}
 manifest['characters'][char]={action:pack(source/f'player/{char}/{file}',f'{char}-{action}') for action,file in mapping.items()}
manifest['stage']=pack(source/'background/0.gif','stage')
(target/'manifest.json').write_text(json.dumps(manifest,indent=2))
print('Packed',sum(x['frames'] for c in manifest['characters'].values() for x in c.values()),'character frames and',manifest['stage']['frames'],'stage frames')
