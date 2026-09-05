# -*- coding: utf-8 -*-
import json, time, urllib.request, urllib.parse, urllib.error

UA = {"User-Agent": "CanteenOS-research/1.0 (seed-data research; local run)"}

def get(url, tries=4):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=40) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 429 and i < tries-1:
                time.sleep(8*(i+1)); continue
            raise
        except Exception:
            if i < tries-1:
                time.sleep(4*(i+1)); continue
            raise

# 用中文检索词重新解析上次撞错实体的 5 个 + 物种存疑的木耳
items = [("小葱","小葱"),("豆腐","豆腐"),("腐竹","腐竹"),("生姜","生姜"),("大米","大米"),("木耳","木耳")]
qid_map = {}
for zh, term in items:
    url = "https://www.wikidata.org/w/api.php?" + urllib.parse.urlencode({
        "action":"wbsearchentities","search":term,"language":"zh","uselang":"zh","format":"json","limit":"3"})
    try:
        data = get(url)
        hits = [{"id":h["id"],"label":h.get("label"),"desc":h.get("description","")} for h in data.get("search",[])]
        qid_map[zh] = hits
    except Exception as e:
        qid_map[zh] = [{"id":None,"label":None,"desc":"ERR %s"%e}]
    time.sleep(1.0)

# 取每个词的第 1 个命中做详细查询
qids = [v[0]["id"] for v in qid_map.values() if v and v[0]["id"]]
url = "https://www.wikidata.org/w/api.php?" + urllib.parse.urlencode({
    "action":"wbgetentities","ids":"|".join(qids),"props":"labels|claims",
    "languages":"zh|en|uk","format":"json"})
entities = get(url)["entities"]

rows, images = [], {}
for zh, term in items:
    hits = qid_map[zh]
    top = hits[0] if hits else {"id":None}
    qid = top["id"]
    row = {"zh":zh,"top3":hits,"qid":qid}
    if qid and qid in entities:
        ent = entities[qid]; labels = ent.get("labels",{})
        row["en"] = labels.get("en",{}).get("value")
        row["zh_label"] = labels.get("zh",{}).get("value")
        row["uk"] = labels.get("uk",{}).get("value")
        p18 = ent.get("claims",{}).get("P18",[])
        if p18 and "datavalue" in p18[0]["mainsnak"]:
            row["p18"] = p18[0]["mainsnak"]["datavalue"]["value"]
            images[qid] = row["p18"]
    rows.append(row)

if images:
    titles = "|".join("File:"+f for f in images.values())
    url = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode({
        "action":"query","titles":titles,"prop":"imageinfo","iiprop":"extmetadata",
        "format":"json","formatversion":"2"})
    data = get(url)
    lic_by_title = {}
    norm = {n["from"]: n["to"] for n in data.get("query",{}).get("normalized",[])}
    for p in data.get("query",{}).get("pages",[]):
        ii = p.get("imageinfo"); lic = "NO INFO"
        if ii: lic = ii[0].get("extmetadata",{}).get("LicenseShortName",{}).get("value","UNKNOWN")
        lic_by_title[p.get("title")] = lic
    for r in rows:
        if r.get("qid") in images:
            t = "File:"+images[r["qid"]]
            r["license"] = lic_by_title.get(t) or lic_by_title.get(norm.get(t,"")) or "NOT FOUND"

for r in rows:
    print(json.dumps(r, ensure_ascii=False))
with open("/Users/terry/Desktop/coding/chief-master/chief-master/canteen-os/docs/research/v2/wikidata_probe2_result.json","w") as f:
    json.dump(rows, f, ensure_ascii=False, indent=1)
