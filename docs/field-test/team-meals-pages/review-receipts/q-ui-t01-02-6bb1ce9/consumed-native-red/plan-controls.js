// D visible test controls only. The page/Plan document and API remain production code.
const panel=document.createElement('aside');panel.id='d-plan-controls';panel.style.cssText='padding:12px;border:2px solid #98794d;background:#fff8e8';
panel.innerHTML='<strong>D Q-UI-T01-02 local verification</strong><p>Actual main/C/Worker and fixed Q FakeRepo. Controls alter only the next local HTTP response.</p><button id="d-plan-hold">Hold next plan save response</button> <button id="d-plan-drop">Drop next plan save response</button> <button id="d-plan-release">Release held response</button><pre id="d-plan-control-status">normal local transport</pre>';
document.body.append(panel);const el=id=>document.getElementById(id);
async function control(action){const response=await fetch('/__control',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,path:'/plan/team-week'})});el('d-plan-control-status').textContent=action+': '+await response.text();}
el('d-plan-hold').onclick=()=>control('hold-next');el('d-plan-drop').onclick=()=>control('drop-next');el('d-plan-release').onclick=()=>control('release');
