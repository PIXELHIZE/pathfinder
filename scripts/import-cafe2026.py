#!/usr/bin/env python3
"""Import public exhibitor geometry and route grid used by Cafe Show's official map.
No login, personal information, logos, editorial popularity scores, or descriptions.
"""
import argparse, concurrent.futures, collections, json, math, pathlib, urllib.request
BASE = 'https://floorplan.exporum.com/api/'
EXHIBITION = 19
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--cache', type=pathlib.Path, help='Optional explicit raw API cache; fetch live when omitted.')
parser.add_argument('--check', action='store_true', help='Validate conversion without replacing cafe2026.js.')
args = parser.parse_args()
CACHE = args.cache

def fetch(name):
    url=BASE+name+('' if name=='exhibitions' else '?exhibitionId=19')
    with urllib.request.urlopen(url,timeout=60) as r:return name,json.load(r)

if CACHE and CACHE.exists(): raw=json.loads(CACHE.read_text())
else:
    raw=dict(concurrent.futures.ThreadPoolExecutor().map(fetch,['exhibitions','floors','zones','booths','facilities','nodes','edges']))
    if CACHE: CACHE.write_text(json.dumps(raw,ensure_ascii=False))

def require(condition,message):
    if not condition: raise ValueError(message)

def finite(value):
    return isinstance(value,(int,float)) and not isinstance(value,bool) and math.isfinite(value)

for key in ('exhibitions','floors','zones','booths','facilities','nodes','edges'):
    require(isinstance(raw.get(key),list) and raw[key], 'Missing or changed API collection: '+key)
for key in ('booths','nodes','zones','facilities'):
    require(len({item['id'] for item in raw[key]})==len(raw[key]), 'Duplicate IDs: '+key)
    for item in raw[key]:
        require(all(finite(item.get(axis)) for axis in ('x','y')), 'Invalid coordinates in '+key)
        if key != 'nodes':
            require(all(finite(item.get(axis)) and item[axis]>0 for axis in ('width','height')), 'Invalid dimensions in '+key)
require({z['name'] for z in raw['zones'] if z.get('type')=='hall'}=={'Hall A','Hall B','Hall C','Hall D'}, 'Hall definitions changed; inspect before importing')
require(len(raw['booths'])==615, 'Exhibitor count changed; inspect before replacing the verified dataset')

nodebyid={n['id']:n for n in raw['nodes']}
neighbors=collections.defaultdict(set)
for edge in raw['edges']:
    neighbors[edge['fromNodeId']].add(edge['toNodeId']);neighbors[edge['toNodeId']].add(edge['fromNodeId'])
meta=next(e for e in raw['exhibitions'] if e['id']==EXHIBITION)
require(str(meta.get('year'))=='2026' and meta.get('startDate')=='2026-11-11' and meta.get('endDate')=='2026-11-14', 'Edition metadata changed')
require(isinstance(meta.get('programs'),list), 'Selection program schema changed')
require(all(e['fromNodeId'] in nodebyid and e['toNodeId'] in nodebyid for e in raw['edges']), 'Graph contains unknown node references')
# Conversion keeps official coordinates (translated into each hall's own view box).
# The official API includes diagonal grid edges as optional shortcuts. Only the
# connected orthogonal corridor grid is retained, then collinear runs are merged.
# This is a map-unit graph: the source does not declare a physical distance scale.
import heapq, re

def round4(v): return round(v,4)
def inside(b,x,y):
    if b.get('shapeType')!='polygon':
        return b['x']+1e-5<x<b['x']+b['width']-1e-5 and b['y']+1e-5<y<b['y']+b['height']-1e-5
    pts=[(b['x']+a,b['y']+c) for a,c in b['points']]
    hit=False;j=len(pts)-1
    for i,(xi,yi) in enumerate(pts):
        xj,yj=pts[j]
        if (yi>y)!=(yj>y) and x < (xj-xi)*(y-yi)/(yj-yi)+xi:hit=not hit
        j=i
    return hit

def first_main(start,main):
    heap=[(0,start)];seen=set()
    while heap:
        cost,nid=heapq.heappop(heap)
        if nid in seen:continue
        seen.add(nid)
        if nid in main:return nodebyid[nid]
        a=nodebyid[nid]
        for other in neighbors[nid]:
            if other in seen:continue
            b=nodebyid[other]
            if b['floorId']!=a['floorId']:continue
            heapq.heappush(heap,(cost+math.hypot(a['x']-b['x'],a['y']-b['y']),other))
    raise ValueError('No entrance path')

def merge_runs(lines):
    result=[]
    for key,ranges in lines.items():
        ranges.sort();a,b=ranges[0]
        for c,d in ranges[1:]:
            if c<=b+1e-5:b=max(b,d)
            else:result.append((key,a,b));a,b=c,d
        result.append((key,a,b))
    return result

output=[]
for hall in sorted([z for z in raw['zones'] if z['type']=='hall'],key=lambda z:z['name']):
    letter=hall['name'][-1]
    bs=[b for b in raw['booths'] if b['name'] and (b['zoneId']==hall['id'] or (b['floorId']==hall['floorId'] and re.match('^'+letter+r'\d',b['boothNo']) and hall['x']<=b['x']+b['width']/2<=hall['x']+hall['width'] and hall['y']<=b['y']+b['height']/2<=hall['y']+hall['height']))]
    fs=[f for f in raw['facilities'] if f['name'].startswith(hall['name']) and f['type']=='entrance']
    minx=min([hall['x']]+[b['x'] for b in bs]+[f['x'] for f in fs])-25
    miny=min([hall['y']]+[b['y'] for b in bs]+[f['y'] for f in fs])-25
    maxx=max([hall['x']+hall['width']]+[b['x']+b['width'] for b in bs]+[f['x']+f['width'] for f in fs])+25
    maxy=max([hall['y']+hall['height']]+[b['y']+b['height'] for b in bs]+[f['y']+f['height'] for f in fs])+25
    eligible={n['id']:n for n in raw['nodes'] if n['floorId']==hall['floorId'] and n['type']=='corridor' and minx<=n['x']<=maxx and miny<=n['y']<=maxy}
    g=collections.defaultdict(set)
    for e in raw['edges']:
        a,b=eligible.get(e['fromNodeId']),eligible.get(e['toNodeId'])
        if a and b and (abs(a['x']-b['x'])<1e-5 or abs(a['y']-b['y'])<1e-5):
            g[a['id']].add(b['id']);g[b['id']].add(a['id'])
    comps=[];remain=set(g)
    while remain:
        visited={remain.pop()};stack=list(visited)
        while stack:
            n=stack.pop()
            for other in g[n]:
                if other not in visited:visited.add(other);remain.discard(other);stack.append(other)
        comps.append(visited)
    main=max(comps,key=len)
    offsetx,offsety=minx-20,miny-20
    def point(n):return {'x':round4(n['x']-offsetx),'y':round4(n['y']-offsety)}
    horizontal=collections.defaultdict(list);vertical=collections.defaultdict(list)
    for aid in main:
        a=eligible[aid]
        for bid in g[aid]:
            if bid<aid or bid not in main:continue
            b=eligible[bid]
            if abs(a['y']-b['y'])<1e-5:horizontal[round4(a['y'])].append(tuple(sorted((a['x'],b['x']))))
            else:vertical[round4(a['x'])].append(tuple(sorted((a['y'],b['y']))))
    walkways=[]
    for y,x1,x2 in merge_runs(horizontal):walkways.append([point({'x':x1,'y':y}),point({'x':x2,'y':y})])
    for x,y1,y2 in merge_runs(vertical):walkways.append([point({'x':x,'y':y1}),point({'x':x,'y':y2})])
    booths=[]
    for b in bs:
        doors=[n for n in raw['nodes'] if n['floorId']==hall['floorId'] and n['label']=='door-'+b['boothNo']]
        accesses=[nodebyid[nid] for door in doors for nid in neighbors[door['id']] if nid in main and not inside(b,nodebyid[nid]['x'],nodebyid[nid]['y'])]
        if not accesses:raise ValueError('No main corridor access for '+b['boothNo'])
        door=doors[0]
        access=min(accesses,key=lambda n:(math.hypot(n['x']-door['x'],n['y']-door['y']),n['id']))
        membership=[p for p in meta['programs'] if b['boothNo'] in p['boothNos']]
        tags=[p['nameKo'] for p in membership]
        category=next((p['nameKo'] for p in membership if p['code'] in ('coffee-alley','bakery-alley')), '전시 참가사')
        bb={'id':'cafeshow2026-'+b['boothNo'].lower(),'code':b['boothNo'],'name':b['name'],'category':category,'x':point(b)['x'],'y':point(b)['y'],'width':b['width'],'height':b['height'],'access':point(access),'tags':tags,'sourceBoothId':b['id']}
        if '체리스초이스' in tags:bb.update({'highlighted':True,'highlightLabel':'체리스초이스 공식 선정'})
        if b.get('shapeType')=='polygon':bb.update({'shapeType':'polygon','points':[{'x':round4(a),'y':round4(c)} for a,c in b['points']], 'polygon':[{'x':round4(b['x']+a-offsetx),'y':round4(b['y']+c-offsety)} for a,c in b['points']]})
        booths.append(bb)
    entrances=[]
    for f in fs:
        enode=next(n for n in raw['nodes'] if n['label']=='entrance-'+str(f['id']))
        access=first_main(enode['id'],main)
        p=point(access)
        entrances.append({'id':'entrance-'+str(f['id']),'name':f['name']+' 통로','point':p,'access':p.copy(),'sourcePoint':point(enode)})
    entry={'id':'cafeshow2026-'+letter.lower(),'name':'서울카페쇼 2026 · '+hall['name'],'shortName':'카페쇼 '+letter,'venue':'코엑스 '+('1층' if hall['floorId']==77 else '3층')+' · '+hall['name'],'date':'2026.11.11–11.14','hall':hall['name'],'isSample':False,'description':'서울카페쇼 공식 공개 지도에서 가져온 2026년 행사 기록입니다.','source':{'map':'https://floorplan.exporum.com/embed/cafeshow/','booths':BASE+'booths?exhibitionId=19','highlights':BASE+'exhibitions','geometry':BASE+'nodes?exhibitionId=19','retrievedAt':'2026-11-23','coverage':'홀 내부의 명칭이 있는 부스. 홀 간 이동·로비 부스·명칭 없는 무대는 제외.','coordinateNote':'공식 좌표를 홀별로 평행 이동. 입구 출발점은 공식 연결 통로 지점. 물리 거리 배율 미공개.'},'map':{'width':math.ceil(maxx-minx+40),'height':math.ceil(maxy-miny+40),'walkways':walkways,'sourceOrigin':{'x':round4(offsetx),'y':round4(offsety)}},'entrances':entrances,'booths':sorted(booths,key=lambda b:b['code']),'categories':list(dict.fromkeys(b['category'] for b in booths))}
    require(len(booths)=={'A':102,'B':168,'C':169,'D':113}[letter], 'Hall booth coverage changed: '+letter)
    require(len({b['id'] for b in booths})==len(booths), 'Duplicate booth IDs: '+letter)
    require(walkways and entrances, 'Missing walkways or entrance: '+letter)
    require(all(finite(p[axis]) for segment in walkways for p in segment for axis in ('x','y')), 'Invalid route geometry: '+letter)
    output.append(entry)
    print('GENERATED',letter,len(booths),'booths',len(walkways),'walkways',len(main),'source corridor nodes',flush=True)
if args.check:
    print('Validated all four halls; generated module left unchanged.')
    raise SystemExit(0)
path=pathlib.Path(__file__).resolve().parents[1]/'cafe2026.js'
path.write_text('/**\n * Seoul Cafe Show 2026: public official floor-plan facts, downloaded 2026-11-23.\n * Source: https://floorplan.exporum.com/embed/cafeshow/ (exhibitionId=19).\n * Rectangles, program membership and corridor edges are official geometry.\n * Coordinates translated per hall; physical metres-per-unit is not published.\n * Orthogonal edges only, merged into collinear runs. No popularity scores.\n * Reproduce with: python3 scripts/import-cafe2026.py\n */\nexport const cafeEvents = '+json.dumps(output,ensure_ascii=False,separators=(',',':'))+';\n')
print('WROTE',path,path.stat().st_size,'bytes')
