"""Regional trend checks for the Tier 2/3 grids (results in docs/datasets.md).  python scripts/check_tier23.py"""
import sys, numpy as np, warnings; warnings.simplefilter('ignore')
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from td.fetch import LATS, LONS
from td.stats import series_stats
Y=np.arange(2003,2026)
def load(n):
    d=np.load(Path(__file__).resolve().parents[2] / 'data' / 'interim' / f'{n}.npz'); c=d['data']; m=d['months']
    return c, np.array([int(x[:4]) for x in m]), np.array([int(x[5:7]) for x in m])
def box(c, n=90, s=-90, w=-180, e=180):
    la=(LATS<=n)&(LATS>=s); lo=(LONS>=w)&(LONS<=e)
    wt=np.cos(np.radians(LATS[la]))[:,None]*np.ones(lo.sum())
    sub=c[:,la][:,:,lo]; ok=np.isfinite(sub)
    return np.nansum(sub*wt,axis=(1,2))/np.sum(ok*wt,axis=(1,2))
def trend(label,ts,yrs,mos,months=None,scale=1,unit=''):
    sel=np.ones_like(yrs,bool) if months is None else np.isin(mos,months)
    a=np.array([np.nanmean(ts[sel&(yrs==y)]) if (sel&(yrs==y)&np.isfinite(ts)).any() else np.nan for y in Y])
    ok=np.isfinite(a); r=series_stats(a[ok],Y[ok])
    print(f"  {label:42} {r['slopePerDecade']*scale:+9.3f} {unit}/decade  p={r['p']:.3g}  n={ok.sum()}")
for n in (sys.argv[1:] or ['seaice','sealevel','snow','lst','soil','airs','ozone','sst','chlor']):
    c,yrs,mos=load(n); filled=int((~np.isnan(c).all(axis=(1,2))).sum())
    print(f"== {n}: months {filled}/{len(c)}, range {np.nanmin(c):.4g}..{np.nanmax(c):.4g}")
    if n=='seaice':
        trend('Arctic Sept concentration (>60N)',box(c,90,60),yrs,mos,[9],1,'%-pts')
        trend('Antarctic Feb concentration (<-60)',box(c,-60,-90),yrs,mos,[2],1,'%-pts')
    if n=='sealevel': trend('Global mean sea level',box(c,66,-66),yrs,mos,None,1000,'mm')
    if n=='snow':
        trend('NH land snow, May-June',box(c,90,40),yrs,mos,[5,6],1,'%-pts')
        trend('Tibet snow, annual',box(c,40,28,75,100),yrs,mos,None,1,'%-pts')
    if n=='lst':
        trend('Global land LST (day)',box(c,75,-60),yrs,mos,None,1,'K')
        trend('Siberia/Arctic land LST (60-75N)',box(c,75,60),yrs,mos,None,1,'K')
    if n=='soil':
        trend('Mediterranean topsoil, JJA',box(c,45,35,-10,40),yrs,mos,[6,7,8],1,'kg/m2')
        trend('Global land topsoil',box(c,90,-60),yrs,mos,None,1,'kg/m2')
    if n=='airs':
        trend('Global stratospheric temperature',box(c),yrs,mos,None,1,'K')
        trend('Tropical stratosphere (20S-20N)',box(c,20,-20),yrs,mos,None,1,'K')
    if n=='ozone':
        trend('Antarctic Oct ozone (<-65)',box(c,-65,-90),yrs,mos,[10],1,'DU')
        trend('Global ozone (60S-60N)',box(c,60,-60),yrs,mos,None,1,'DU')
    if n=='sst':
        trend('Global SST (60S-60N)',box(c,60,-60),yrs,mos,None,1,'degC')
        trend('N Atlantic SST (20-60N, 80W-0)',box(c,60,20,-80,0),yrs,mos,None,1,'degC')
    if n=='chlor':
        trend('Global ocean chlorophyll (60S-60N)',box(c,60,-60),yrs,mos,None,1,'mg/m3')
    if n=='no2':
        for name,b in [('Europe',(60,40,-10,30)),('Eastern US',(45,30,-90,-70)),('Eastern China',(40,28,110,122)),('Indo-Gangetic Plain',(30,22,75,88)),('Middle East',(35,20,40,60))]:
            trend(f'NO2 {name}',box(c,*b),yrs,mos,None,1e-15,'1e15 molec/cm2')
