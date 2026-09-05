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

items = [
    ("番茄","tomato"), ("小葱","scallion"), ("香菜","coriander"),
    ("生抽","light soy sauce"), ("老抽","dark soy sauce"), ("蚝油","oyster sauce"),
    ("豆瓣酱","doubanjiang"), ("五香粉","five-spice powder"), ("木耳","wood ear"),
    ("粉丝","cellophane noodles"), ("豆腐","tofu"), ("腐竹","yuba"),
    ("花椒","Sichuan pepper"), ("八角","star anise"), ("料酒","Shaoxing wine"),
    ("香油","sesame oil"), ("生姜","ginger"), ("大蒜","garlic"),
    ("洋葱","onion"), ("土豆","potato"), ("大白菜","Napa cabbage"),
    ("茄子","eggplant"), ("青椒","bell pepper"), ("鸡蛋","chicken egg"),
    ("大米","rice"), ("糯米","glutinous rice"), ("白糖","sugar"),
    ("干辣椒","chili pepper"), ("桂皮","Cinnamomum cassia"), ("香叶","bay leaf"),
]

qid_map = {}
for zh, en in items:
    url = "https://www.wikidata.org/w/api.php?" + urllib.parse.urlencode({
        "action":"wbsearchentities","search":en,"language":"en","format":"json","limit":"1"})
    try:
        data = get(url)
        if data.get("search"):
            hit = data["search"][0]
            qid_map[zh] = {"qid": hit["id"], "search_label": hit.get("label",""), "desc": hit.get("description","")}
        else:
            qid_map[zh] = {"qid": None, "search_label": None, "desc": "NO SEARCH HIT"}
    except Exception as e:
        qid_map[zh] = {"qid": None, "search_label": None, "desc": "ERR %s" % e}
    time.sleep(0.8)

qids = [v["qid"] for v in qid_map.values() if v["qid"]]
entities = {}
for i in range(0, len(qids), 10):
    chunk = qids[i:i+10]
    url = "https://www.wikidata.org/w/api.php?" + urllib.parse.urlencode({
        "action":"wbgetentities","ids":"|".join(chunk),"props":"labels|claims",
        "languages":"zh|en|uk","format":"json"})
    entities.update(get(url)["entities"])
    time.sleep(2)

rows, images = [], {}
for zh, en in items:
    info = qid_map[zh]; qid = info["qid"]
    if not qid or qid not in entities:
        rows.append({"zh":zh,"en_term":en,"qid":qid,"note":info["desc"]}); continue
    ent = entities[qid]
    labels = ent.get("labels", {})
    en_l = labels.get("en",{}).get("value")
    zh_l = labels.get("zh",{}).get("value")
    uk_l = labels.get("uk",{}).get("value")
    p18 = ent.get("claims",{}).get("P18",[])
    img = None
    if p18 and "datavalue" in p18[0]["mainsnak"]:
        img = p18[0]["mainsnak"]["datavalue"]["value"]
        images[qid] = img
    rows.append({"zh":zh,"en_term":en,"qid":qid,"search_label":info["search_label"],
                 "desc":info["desc"],"en":en_l,"zh_label":zh_l,"uk":uk_l,"p18":img})

licenses = {}
if images:
    titles = "|".join("File:"+f for f in images.values())
    url = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode({
        "action":"query","titles":titles,"prop":"imageinfo","iiprop":"extmetadata",
        "format":"json","formatversion":"2"})
    data = get(url)
    lic_by_title, norm_from_to = {}, {n["from"]: n["to"] for n in data.get("query",{}).get("normalized",[])}
    for p in data.get("query",{}).get("pages",[]):
        ii = p.get("imageinfo"); lic = "NO INFO"
        if ii:
            lic = ii[0].get("extmetadata",{}).get("LicenseShortName",{}).get("value","UNKNOWN")
        lic_by_title[p.get("title")] = lic
    for qid, fn in images.items():
        t = "File:"+fn
        licenses[qid] = lic_by_title.get(t) or lic_by_title.get(norm_from_to.get(t,"")) or "NOT FOUND"
for r in rows:
    if r.get("qid") in licenses:
        r["license"] = licenses[r["qid"]]

sparql_status, sparql_hits = "not run", {}
try:
    sparql = ("SELECT ?item ?ukLabel WHERE { VALUES ?item { %s } "
              "OPTIONAL { ?item rdfs:label ?ukLabel . FILTER(LANG(?ukLabel)='uk') } }") % " ".join("wd:"+q for q in qids)
    url = "https://query.wikidata.org/sparql?" + urllib.parse.urlencode({"query":sparql,"format":"json"})
    data = get(url)
    for b in data["results"]["bindings"]:
        sparql_hits[b["item"]["value"].rsplit("/",1)[-1]] = b.get("ukLabel",{}).get("value")
    sparql_status = "ok"
except Exception as e:
    sparql_status = "ERR %s" % e

n = len(rows)
uk_ok = sum(1 for r in rows if r.get("uk"))
zh_ok = sum(1 for r in rows if r.get("zh_label"))
en_ok = sum(1 for r in rows if r.get("en"))
p18_ok = sum(1 for r in rows if r.get("p18"))
lic_dist = {}
for r in rows:
    if "license" in r:
        lic_dist[r["license"]] = lic_dist.get(r["license"],0)+1

print("== TABLE ==")
for r in rows:
    print(json.dumps(r, ensure_ascii=False))
print("== SUMMARY ==")
print(json.dumps({"total":n,"en":en_ok,"zh":zh_ok,"uk":uk_ok,"p18":p18_ok,
                  "uk_pct":round(100.0*uk_ok/n,1),"zh_pct":round(100.0*zh_ok/n,1),
                  "license_dist":lic_dist,"sparql":sparql_status,
                  "sparql_items_returned":len(sparql_hits),
                  "sparql_uk_present":sum(1 for v in sparql_hits.values() if v)}, ensure_ascii=False, indent=1))
with open("/Users/terry/Desktop/coding/chief-master/chief-master/canteen-os/docs/research/v2/wikidata_probe_result.json","w") as f:
    json.dump({"rows":rows,"summary":{"total":n,"en":en_ok,"zh":zh_ok,"uk":uk_ok,"p18":p18_ok,"license_dist":lic_dist,"sparql":sparql_status}}, f, ensure_ascii=False, indent=1)
