# mapopen-holds.py DIR...: the full map's opening, from recordings only (Nov 3). Per opening (DIR/openN.mp4, recN.txt with the
# recorder's "Recording started" wall clock, taps.txt with each touch-down's wall clock, modes.txt optional):
#   slide_start / slide_end  ms after the touch-down: the first big screen change, and when the screen stops sliding
#   streets                  a band low on the map (y 690-780 pt, clear of the pins and the pill) at 90% of its final texture
#   settled                  the last frame that changes within 3 s (the pins' wave over)
#   motion_holds             [at, ms]: 30 ms or more with no new frame BETWEEN two frames that both moved. The recorder makes
#                            no frames while the screen is still, so a gap on a still screen (waiting for the pins) is not a hold.
# Needs ffmpeg and numpy. iPhone 18 Pro Simulator (402x874 points).
import subprocess, sys, os, json, re
import numpy as np
W,H=201,437
def frames(path):
    p=subprocess.run(['ffmpeg','-v','info','-i',path,'-fps_mode','passthrough','-vf',f'scale={W}:{H},showinfo','-pix_fmt','gray','-f','rawvideo','-'],capture_output=True)
    pts=np.array([float(m) for m in re.findall(rb'pts_time:([0-9.]+)',p.stderr)])
    a=np.frombuffer(p.stdout,np.uint8); n=min(len(a)//(W*H),len(pts))
    return pts[:n], a[:n*W*H].reshape(n,H,W).astype(np.int16)
import json, os
def two(d,n,tapabs):
    r0=float([l for l in open(f'{d}/rec{n}.txt') if 'Recording started' in l][0].split()[0]); tap=tapabs-r0
    t,F=frames(f'{d}/open{n}.mp4')
    keep=[0]+[i for i in range(1,len(t)) if t[i]-t[i-1]>0.005]; t=t[keep]; F=F[keep][:,30:,:]
    fr=np.concatenate([[0],(np.abs(np.diff(F,axis=0))>12).mean(axis=(1,2))])
    W=[i for i in range(len(t)) if tap<=t[i]<=tap+3.0]
    s0=next((i for i in W if fr[i]>0.08),None)
    if s0 is None: return {'open':n,'error':'no slide'}
    # the slide: moving frames from s0 until the change falls under 0.3% for 3 frames
    i=s0; still=0
    while i+1<len(t) and still<3:
        i+=1; still = still+1 if fr[i]<0.003 else 0
    s1=i-3
    holds=[]
    for k in W:
        if k<2 or k+1>=len(t): continue
        g=t[k]-t[k-1]
        if g>=0.030 and fr[k-1]>0.002 and fr[k]>0.002: holds.append((round((t[k-1]-tap)*1000),round(g*1000)))
    # streets: texture of a band low on the map (y 690-780 pt, over the players pill, clear of the pins), final = last 10 frames
    reg=F[:,(690-30)//2:(780-30)//2,20:180].astype(np.float32).reshape(len(F),-1).std(axis=1)
    fin=np.median(reg[-10:]); base=reg[s1]
    st=next((k for k in range(s1,len(t)) if reg[k]>=base+0.9*(fin-base)),None) if fin>base+3 else s1
    last=max([k for k in W if fr[k]>0.002] or [s0])
    return {'open':n,'slide_start':round((t[s0]-tap)*1000),'slide_end':round((t[s1]-tap)*1000),'streets':round((t[st]-tap)*1000) if st is not None else None,'settled':round((t[last]-tap)*1000),'motion_holds':holds}
for d in sys.argv[1:]:
    taps={l.split()[0]:float(l.split()[1]) for l in open(f'{d}/taps.txt')}
    modes={l.split()[0]:l.split()[1] for l in open(f'{d}/modes.txt')} if os.path.exists(f'{d}/modes.txt') else {}
    n=1
    while os.path.exists(f'{d}/open{n}.mp4'):
        print(json.dumps({'dir':os.path.basename(d),'mode':modes.get(f'open{n}',''),**two(d,n,taps[f'open{n}'])})); n+=1
