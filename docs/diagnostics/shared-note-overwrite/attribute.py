# For each run: tests (signed-in or not) running at the moment the seeded note's content changed.
import json,sys,glob,datetime as dt,os
O=sys.argv[1]
def iso(s): return dt.datetime.fromisoformat(s.replace("Z","+00:00"))
for rep in sorted(glob.glob(f"{O}/*-run*.json")):
    label=os.path.basename(rep)[:-5]
    w=f"{O}/{label}.watch.jsonl"
    if not os.path.exists(w): continue
    tests=[]
    def walk(s,path):
        for sp in s.get("specs",[]):
            for t in sp["tests"]:
                for r in t["results"]:
                    st=iso(r["startTime"]); tests.append((st,st+dt.timedelta(milliseconds=r["duration"]),f'{sp["file"]}:{sp["line"]} {" › ".join(path+[sp["title"]])}',r["status"],r.get("workerIndex")))
        for c in s.get("suites",[]): walk(c,path+[c["title"]])
    for s in json.load(open(rep))["suites"]: walk(s,[])
    prev=None
    print(f"== {label}")
    for l in open(w):
        r=json.loads(l)
        if r["ev"]!="change": continue
        c=(r["note"] or {}).get("content")
        if c==prev: continue
        prev=c; at=iso(r["at"])
        print(f'  {r["at"][11:23]} v{r["note"]["version"]} {c[:70]!r}  body_kept={"Shared with B" in c}')
        for st,en,name,status,wk in tests:
            if st-dt.timedelta(seconds=1)<=at<=en+dt.timedelta(seconds=5): print(f'      running: w{wk} {status:7} {name}')
