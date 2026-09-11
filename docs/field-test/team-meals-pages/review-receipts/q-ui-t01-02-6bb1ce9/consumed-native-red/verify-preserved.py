from pathlib import Path
import json,sys
p=Path(__file__).resolve().parent;prefix=sys.argv[1]
before=json.loads((p/(prefix+'-before.json')).read_text());after=json.loads((p/(prefix+'-after.json')).read_text())
value=lambda v:next(x['value'] for x in v['inputs'] if x.get('focus')=='servings-0')
assert value(before)=='11'
print(json.dumps({'layer':'assertion over new D actual native DOM observations','before':value(before),'after':value(after),'expected':'11','input':'2026-09-15 午 第一道样本菜'}),flush=True)
assert value(after)=='11', 'Importing another date must retain the prior unsaved eleven-serving edit'
