const API_URL = "https://script.google.com/macros/s/AKfycbyvSfkWd5J4jGoO0etu7JqGh3Ewu9BAT8dHWI7uYbg4-ibR57W7UB35m3wJcpCMl-RA/exec"; 

let dbData = [];
let rankedList = [];

// Konversi nilai ke skala 1-4
const scaleVal = (val, type) => {
  if (type === 'clsd') return val < 85 ? 1 : (val >= 100 ? 4 : 1 + ((val - 85) / 15) * 3);
  if (type === 'sla')  return val < 85 ? 1 : (val >= 130 ? 4 : 1 + ((val - 85) / 45) * 3);
  if (type === 'puas') return val >= 4 ? 4 : 1 + ((val - 1) / 3) * 3;
  return 1;
};

// Fungsi inti perhitungan
function calculate(rows) {
  const t = rows.length;
  if (t === 0) return { t:0, tc:0, pc:0, nkc:1, sla:0, nks:1, puas:0, nkp:1, final:1 };
  
  const tc = rows.filter(r => r['Status'] === 'Closed').length;
  const pc = (tc / t) * 100;
  const sla = rows.reduce((s, r) => s + (parseFloat(String(r['ACH SLA']).replace(',','.')) || 0), 0) / t;
  const puas = rows.reduce((s, r) => s + (parseFloat(String(r['Tingkat Kepuasan']).replace(',','.')) || 0), 0) / t;
  
  const nkc = scaleVal(pc, 'clsd');
  const nks = scaleVal(sla, 'sla');
  const nkp = scaleVal(puas, 'puas');
  // Weighting 30-40-30
  const final = (nkc * 0.3) + (nks * 0.4) + (nkp * 0.3);
  
  return { 
    t, tc, pc: pc.toFixed(1), nkc: nkc.toFixed(2),
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

  const g = calculate(dbData);
  const m = [
    ["Total Problem", g.t], ["Total Closed", g.tc], ["% Closed", g.pc+"%"], ["Konversi (C)", g.nkc],
    ["Avg SLA", g.sla], ["Konversi (S)", g.nks], ["Avg Kepuasan", g.puas], ["Konversi (K)", g.nkp],
    ["Score Layanan", g.final]
  ];

  document.getElementById('home-metrics').innerHTML = m.map((x, i) => `
    <div class="${i===8 ? 'bg-indigo-600 text-white' : 'bg-white'} p-4 rounded-xl shadow-sm border border-slate-200">
      <p class="text-[9px] font-bold ${i===8 ? 'opacity-70' : 'text-slate-400'} uppercase">${x[0]}</p>
      <p class="text-2xl font-black italic">${x[1]}</p>
    </div>
  `).join('');

  renderTable(dbData, 'Nama Problem', 'home-body-prob');
  renderTable(dbData, 'Nama Solve', 'home-body-pic');
  renderWarning(dbData, 'home-body-warn');
}

function selectDept(name, el, rank) {
  document.getElementById('view-home').classList.add('hidden');
  document.getElementById('view-dept').classList.remove('hidden');
  document.querySelectorAll('.dept-item').forEach(i => i.classList.remove('active-dept'));
  el.classList.add('active-dept');

  const filtered = dbData.filter(r => r['Departemen'] === name);
  const d = calculate(filtered);

  document.getElementById('det-name').innerText = name;
  document.getElementById('det-rank').innerText = `RANK #${rank}`;
  document.getElementById('det-score').innerText = d.final;

  renderTable(filtered, 'Nama Problem', 'dept-body-prob');
  renderTable(filtered, 'Nama Solve', 'dept-body-pic');
}

// Render Tabel Detail 6 Kolom
function renderTable(data, key, bodyId) {
  const groups = {};
  data.forEach(r => { 
    const val = r[key] || "Unknown";
    groups[val] = groups[val] || []; 
    groups[val].push(r); 
  });
  
  const sorted = Object.keys(groups)
    .map(k => ({ name: k, ...calculate(groups[k]) }))
    .sort((a,b) => b.t - a.t).slice(0, 20);

  document.getElementById(bodyId).innerHTML = sorted.map(i => `
    <tr>
      <td class="p-3 font-bold text-slate-700">${i.name}</td>
      <td class="p-3 text-center">${i.t}</td>
      <td class="p-3 text-center text-emerald-600">${i.tc}</td>
      <td class="p-3 text-center">${i.pc}%</td>
      <td class="p-3 text-center text-blue-600">${i.sla}</td>
      <td class="p-3 text-center text-amber-600">${i.puas}</td>
      <td class="p-3 text-center font-black text-indigo-600 italic text-sm">${i.final}</td>
    </tr>
  `).join('');
}

function renderWarning(data, bodyId) {
  const warn = data.filter(r => r['Status'] !== 'Closed').map(r => {
    const u = parseFloat(String(r['Umur Problem']).replace(',','.')) || 0; 
    const t = parseFloat(String(r['Target Hari']).replace(',','.')) || 0;
    let l = ''; let c = '';
    if (u > t) { l = 'OVER'; c = 'bg-red-500 text-white'; }
    else if (u >= t - 0.5) { l = 'NEAR'; c = 'bg-amber-500 text-white'; }
    return { ...r, u, t, l, c };
  }).filter(x => x.l !== '').sort((a,b) => b.u - a.u).slice(0, 30);

  document.getElementById(bodyId).innerHTML = warn.map(r => `
    <tr>
      <td class="p-3 font-bold text-[9px] uppercase">${r['Departemen']}</td>
      <td class="p-3 font-mono text-indigo-600">${r['No Problem']}</td>
      <td class="p-3 truncate max-w-[150px]">${r['Nama Problem']}</td>
      <td class="p-3 text-slate-500">${r['Nama Solve']}</td>
      <td class="p-3 text-center font-bold">${r.u} / ${r.t} H</td>
      <td class="p-3 text-center"><span class="px-2 py-0.5 rounded text-[8px] font-black ${r.c}">${r.l}</span></td>
    </tr>
  `).join('');
}

function doSearch(input, bodyId) {
  const f = input.value.toUpperCase();
  const rows = document.getElementById(bodyId).getElementsByTagName("tr");
  for (let i = 0; i < rows.length; i++) {
    rows[i].style.display = rows[i].innerText.toUpperCase().includes(f) ? "" : "none";
  }
}

async function init() {
  try {
    const res = await fetch(API_URL);
    dbData = await res.json();
    const depts = [...new Set(dbData.map(r => r['Departemen']))].filter(n => n && n.trim() !== "");
    rankedList = depts.map(n => ({ name: n, ...calculate(dbData.filter(r => r['Departemen'] === n)) }))
                 .sort((a,b) => b.final - a.final);

    document.getElementById('dept-list').innerHTML = rankedList.map((d, i) => `
      <div onclick="selectDept('${d.name.replace(/'/g, "\\'")}', this, ${i+1})" class="dept-item cursor-pointer p-3 rounded-lg hover:bg-slate-50 border border-transparent transition-all">
        <div class="flex justify-between text-[9px] mb-1 font-bold text-slate-400"><span>RANK #${i+1}</span><span class="text-indigo-600">${d.final}</span></div>
        <h3 class="text-[11px] uppercase truncate font-medium">${d.name}</h3>
      </div>
    `).join('');
    showHome();
  } catch (e) { console.error("Error loading data:", e); }
}
document.addEventListener('DOMContentLoaded', init);
