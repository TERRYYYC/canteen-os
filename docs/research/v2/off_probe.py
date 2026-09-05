# -*- coding: utf-8 -*-
import json
path = "/Users/terry/Desktop/coding/chief-master/chief-master/canteen-os/docs/research/v2/ingredients.txt"
lines = open(path, encoding="utf-8", errors="replace").read().splitlines()
entries, cur = [], []
for ln in lines:
    if not ln.strip():
        if cur: entries.append(cur); cur = []
    else:
        cur.append(ln)
if cur: entries.append(cur)

def langs_of(entry):
    s = set()
    for ln in entry:
        if ln.startswith("<") or ln.startswith("#"): continue
        p = ln.split(":",1)[0].strip()
        if 1 <= len(p) <= 5 and ":" in ln and not p.startswith("description"):
            s.add(p)
    return s

total = len(entries)
with_uk = [e for e in entries if any(l.startswith("uk:") for l in e)]
with_zh = [e for e in entries if any(l.startswith("zh:") or l.startswith("zh-") or l.startswith("zh_") for l in e)]
with_en = [e for e in entries if any(l.startswith("en:") for l in e)]
uk_lines = sum(1 for l in lines if l.startswith("uk:"))
zh_lines = sum(1 for l in lines if l.startswith("zh:") or l.startswith("zh-") or l.startswith("zh_"))
en_lines = sum(1 for l in lines if l.startswith("en:"))

terms = ["doubanjiang","douban","pixian","oyster sauce","light soy sauce","dark soy sauce",
         "five spice","five-spice","shaoxing","sesame oil","yuba","tofu skin","wood ear",
         "black fungus","sichuan pepper","szechuan","star anise","glutinous rice",
         "cellophane noodles","glass noodles","vermicelli","chinkiang","black vinegar",
         "cooking wine","huadiao"]
term_hits = {}
for t in terms:
    for e in entries:
        for l in e:
            if l.startswith("en:") and t in l.lower():
                term_hits[t] = {"line": l.strip(),
                                "uk": any(x.startswith("uk:") for x in e),
                                "zh": any(x.startswith("zh:") for x in e)}
                break
        if t in term_hits: break

uk_samples = [l.strip() for l in lines if l.startswith("uk:") and ("соєв" in l or "устрич" in l or "кунжут" in l or "імбир" in l)][:8]
uk_random = [l.strip() for l in lines if l.startswith("uk:")][:5]

out = {"total_entries": total, "entries_with_en": len(with_en), "entries_with_zh": len(with_zh),
       "entries_with_uk": len(with_uk), "uk_pct": round(100*len(with_uk)/total,1),
       "zh_pct": round(100*len(with_zh)/total,1), "en_pct": round(100*len(with_en)/total,1),
       "en_lines": en_lines, "zh_lines": zh_lines, "uk_lines": uk_lines,
       "term_hits": term_hits, "uk_samples": uk_samples, "uk_random": uk_random}
print(json.dumps(out, ensure_ascii=False, indent=1))
