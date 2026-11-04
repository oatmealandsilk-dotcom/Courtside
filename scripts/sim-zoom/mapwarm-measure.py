# mapwarm-measure.py DIR... (Nov 4, the warm map: mapWarm): the full map's opening, from recordings only. Per open
# (DIR/openN.mp4, recN.txt, taps.txt "openN <wall> tapped", modes.txt "openN mode"), times in ms after the finger went down.
# Frames at half points (iPhone 18 Pro, 402x874 pt).
#   slide_start   first frame with >8% of the screen changed
#   slide_end     the map page has landed: its top row (search bar, y 80-112 pt) found at no offset (tracked frame by frame)
#   streets_seen  the map page's own part of the screen (right of its sliding edge) shows its streets: a band low on the map
#                 (y 690-780 pt, clear of the pins and the pill) within a few levels of how it ends, shifted by the page's offset
#   streets_full  the same, with the page landed
#   settled       the last frame within 3 s with more than 0.2% of the screen changing (the pins' wave over)
#   holds         [at, ms]: 30 ms or more between two frames that both moved, while the page slides and while the pins come in
#                 (the recorder makes no frames on a still screen, so a gap on a still screen is not a hold)
import subprocess, sys, os, json, re
import numpy as np
W,H=201,437
TOP=slice(62,76); BAND=slice(345,390); BE=float(os.environ.get('BE','1.5'))
def frames(path):
    p=subprocess.run(['ffmpeg','-v','info','-i',path,'-fps_mode','passthrough','-vf',f'scale={W}:{H},showinfo','-pix_fmt','gray','-f','rawvideo','-'],capture_output=True)
    pts=np.array([float(m) for m in re.findall(rb'pts_time:([0-9.]+)',p.stderr)])
    a=np.frombuffer(p.stdout,np.uint8); n=min(len(a)//(W*H),len(pts))
    return pts[:n], a[:n*W*H].reshape(n,H,W).astype(np.int16)
def offset(Fk,Ff):
    best=(1e9,0)
    for dx in range(0,195):
        e=np.abs(Fk[TOP,dx:]-Ff[TOP,:W-dx]).mean()
        if e<best[0]: best=(e,dx)
    return best[1],best[0]
def one(d,n,tapabs,debug=False):
    r0=float([l for l in open(f'{d}/rec{n}.txt') if 'Recording started' in l][0].split()[0]); tap=tapabs-r0
    t,F=frames(f'{d}/open{n}.mp4')
    fin=min(range(len(t)),key=lambda k:abs(t[k]-tap-2.6))
    G=F[:,15:,:]
    fr=np.concatenate([[0],(np.abs(np.diff(G,axis=0))>12).mean(axis=(1,2))])
    Wn=[i for i in range(len(t)) if tap<=t[i]<=tap+3.0]
    s0=next((i for i in Wn if fr[i]>0.08),None)
    if s0 is None: return {'open':n,'error':'no slide'}
    ms=lambda k: round((t[k]-tap)*1000) if k is not None else None
    s1=None; seen=None; full=None
    ref=F[fin,BAND,:].std()
    for k in range(s0,len(t)):
        if t[k]-tap>2.6: break
        dx,e=offset(F[k],F[fin])
        if dx>=W-30 or e>6: continue
        reg=F[k,BAND,dx+2:]
        tx=reg.std() if reg.shape[1]>=12 else 0.0
        if debug: print(f'  {ms(k):5d} dx {dx:3d} top {e:4.1f} tex {tx:5.2f} ref {ref:5.2f} fr {fr[k]*100:5.2f}%')
        if s1 is None and dx<=1: s1=k
        if seen is None and reg.shape[1]>=12 and tx>=0.6*ref: seen=k
        if full is None and dx<=1 and tx>=0.6*ref: full=k
        if s1 is not None and full is not None and not debug: break
    mov=[k for k in Wn if fr[k]>0.002]
    last=max(mov or [s0])
    holds=[]
    for a,b in zip(mov,mov[1:]):
        g=t[b]-t[a]
        inslide=s1 is not None and s0<=a and b<=s1
        inwave=full is not None and a>=full
        if g>=0.030 and (inslide or (inwave and g<0.25)): holds.append((ms(a),round(g*1000)))
    return {'open':n,'slide_start':ms(s0),'slide_end':ms(s1),'streets_seen':ms(seen),'streets_full':ms(full),'settled':ms(last),'holds':holds}
if __name__=='__main__':
    debug='-d' in sys.argv
    for d in [a for a in sys.argv[1:] if a!='-d']:
        taps={l.split()[0]:float(l.split()[1]) for l in open(f'{d}/taps.txt')}
        modes={l.split()[0]:l.split()[1] for l in open(f'{d}/modes.txt')} if os.path.exists(f'{d}/modes.txt') else {}
        n=1
        while os.path.exists(f'{d}/open{n}.mp4'):
            if f'open{n}' in taps: print(json.dumps({'dir':os.path.basename(d),'mode':modes.get(f'open{n}',''),**one(d,n,taps[f'open{n}'],debug)}),flush=True)
            n+=1
