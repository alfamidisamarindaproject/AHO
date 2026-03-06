const API_URL = "https://script.google.com/macros/s/AKfycbyvSfkWd5J4jGoO0etu7JqGh3Ewu9BAT8dHWI7uYbg4-ibR57W7UB35m3wJcpCMl-RA/exec"; 

let db = [];
let ranked = [];

// Fungsi Helper Angka
const parse = (v) => parseFloat(String(v).replace(',', '.')) || 0;

// Logika Skor 1-4
function getValScale(val, type) {
  if (type === 'clsd') return val < 85 ? 1 : (val >= 100 ? 4 : 1 + ((val - 85) / 15) * 3);
  if (type === 'sla')  return val < 85 ? 1 : (val >= 130 ? 4 : 1 + ((val - 85) / 45) * 3);
  if (type === 'puas') return val >= 4 ? 4 : 1 + ((val - 1) / 3) * 3;
  return 1;
}

function calculateAll(rows) {
  const total = rows.length;
  if (total === 0) return { t:0, tc:0, pc:"0%", nkc:1, sla:0, nks:1, puas:0, nkp:1, final:1 };
  
  const tc = rows.filter(r => r['Status'] === 'Closed').length;
  const pc = (tc / total) * 100;
  const sla = rows.reduce((s, r) => s + parse(r['ACH SLA']), 0) / total;
  const puas = rows.reduce((s, r) => s + parse(r['Tingkat Kepuasan']), 0) / total;
  
  const nkc = getValScale(pc, 'clsd');
  const nks = getValScale(sla, 'sla');
  const nkp = getValScale(puas, 'puas');
  const final = (nkc * 0.3) + (nks * 0.4) + (nkp * 0.2);
  
  return { 
    t: total, tc, pc: pc.toFixed(1) + "%", nkc: nkc.toFixed(2),
    sla: sla.toFixed(1), nks: nks.toFixed(2), 
    puas: puas.toFixed(1), nkp: nkp.toFixed(2), 
    final: final.toFixed(2)
  };
}

// Navigasi
function showHome() {
  document.getElementById('view-home').classList.remove('hidden');
  document.getElementById('view-dept').classList.add('hidden');
  document.querySelectorAll('.dept-item').forEach(i => i.classList.remove('active-dept'));

  const g = calculateAll(db);
  const m = [
    ["Total Problem", g.t], ["Total Closed", g.tc], ["% Closed", g.pc], ["Konversi (C)", g.nkc],
    ["Avg SLA", g.sla], ["Konversi (S)", g.nks], ["Avg Kepuasan", g.puas], ["Konversi (K)", g.nkp],
    ["Score Layanan", g.final]
  ];

  document.getElementById('home-metrics').innerHTML = m.map((x, i) => `
    <div class="${i===8 ? 'bg-indigo-600 text-white' : 'bg-white'} p-4 rounded-xl shadow-sm border border-slate-200">
      <p class="text-[9px] font-bold ${i===8 ? 'opacity-70' : 'text-slate-400'} uppercase">${x[0]}</p>
      <p class="text-2xl font-black italic">${x[1]}</p>
    </div>
  `).join('');

  renderTable(db, 'Nama Problem', 'home-body-prob');
  renderTable(db, 'Nama Solve', 'home-body-pic');
  renderWarning(db, 'home-body-warn');
}

function selectDept(name, el, rank) {
  document.getElementById('view-home').classList.add('hidden');
  document.getElementById('view-dept').classList.remove('hidden');
  document.querySelectorAll('.dept-item').forEach(i => i.classList.remove('active-dept'));
  el.classList.add('active-dept');

  const filtered = db.filter(r => r['Departemen'] === name);
  const d = calculateAll(filtered);

  document.getElementById('det-name').innerText = name;
  document.getElementById('det-rank').innerText = `RANK #${rank}`;
  document.getElementById('det-score').innerText = d.final;

  renderTable(filtered, 'Nama Problem', 'dept-body-prob');
  renderTable(filtered, 'Nama Solve', 'dept-body-pic');
}

// Helpers
function renderTable(data, key, bodyId) {
  const groups = {};
  data.forEach(r => { groups[r[key]] = groups[r[key]] || []; groups[r[key]].push(r); });
  const sorted = Object.keys(groups).map(k => ({ name: k, ...calculateAll(groups[k]) }))
                .sort((a,b) => b.t - a.t).slice(0, 15);

  document.getElementById(bodyId).innerHTML = sorted.map(i => `
    <tr><td class="p-2 font-medium">${i.name} (${i.t})</td><td class="p-2 text-center">${i.pc}</td><td class="p-2 text-center font-bold text-indigo-600">${i.final}</td></tr>
  `).join('');
}

function renderWarning(data, bodyId) {
  const warn = data.filter(r => r['Status'] !== 'Closed').map(r => {
    const u = parse(r['Umur Problem']); const t = parse(r['Target Hari']);
    let l = ''; let c = '';
    if (u > t) { l = 'OVER'; c = 'bg-red-500 text-white'; }
    else if (u >= t - 0.5) { l = 'NEAR'; c = 'bg-amber-500 text-white'; }
    return { ...r, u, t, l, c };
  }).filter(x => x.l !== '').sort((a,b) => b.u - a.u);

  document.getElementById(bodyId).innerHTML = warn.map(r => `
    <tr><td class="p-2 font-bold text-[9px] uppercase">${r['Departemen']}</td><td class="p-2 font-mono">${r['No Problem']}</td><td class="p-2 truncate max-w-[120px]">${r['Nama Problem']}</td><td class="p-2 text-slate-500">${r['Nama Solve']}</td><td class="p-2 font-bold">${r.u}/${r.t}</td><td class="p-2"><span class="px-1.5 py-0.5 rounded text-[8px] font-black ${r.c}">${r.l}</span></td></tr>
  `).join('');
}

function doSearch(input, bodyId) {
  const f = input.value.toUpperCase();
  const rows = document.getElementById(bodyId).getElementsByTagName("tr");
  for (let i = 0; i < rows.length; i++) rows[i].style.display = rows[i].innerText.toUpperCase().includes(f) ? "" : "none";
}

async function init() {
  try {
    const res = await fetch(API_URL);
    db = await res.json();
    const depts = [...new Set(db.map(r => r['Departemen']))].filter(n => n);
    ranked = depts.map(n => ({ name: n, ...calculateAll(db.filter(r => r['Departemen'] === n)) }))
             .sort((a,b) => b.final - a.final);

    document.getElementById('dept-list').innerHTML = ranked.map((d, i) => `
      <div onclick="selectDept('${d.name.replace(/'/g, "\\'")}', this, ${i+1})" class="dept-item cursor-pointer p-3 rounded-lg hover:bg-slate-50 border border-transparent">
        <div class="flex justify-between text-[9px] mb-1 font-bold text-slate-400"><span>RANK #${i+1}</span><span class="text-indigo-600">${d.final}</span></div>
        <h3 class="text-[11px] uppercase truncate">${d.name}</h3>
      </div>
    `).join('');
    showHome();
  } catch (e) { console.error(e); }
}
document.addEventListener('DOMContentLoaded', init);
