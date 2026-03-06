const API_URL = "https://script.google.com/macros/s/AKfycbwKYdKR1V5JOr8JaYTt3YU2MZfNwW9WzjxT2dOn_rFPQc8QWxZDMmuEpPNoYEl4Beia/exec"; 

let rawData = [];
let deptRankings = [];

// ==========================================
// RUMUS SKOR (1-4)
// ==========================================
function getScale(val, type) {
  if (type === 'closed') {
    if (val < 85) return 1;
    if (val >= 100) return 4;
    return 1 + ((val - 85) / 15) * 3;
  }
  if (type === 'sla') {
    if (val < 85) return 1;
    if (val >= 130) return 4;
    return 1 + ((val - 85) / 45) * 3;
  }
  if (type === 'puas') {
    if (val >= 4) return 4;
    return 1 + ((val - 1) / 3) * 3;
  }
  return 1;
}

function calc(rows) {
  if (!rows || rows.length === 0) return { total: 0, clsd: 0, pct: "0%", cConv: "1.00", sla: 0, sConv: "1.00", puas: 0, pConv: "1.00", score: "1.00" };
  
  const total = rows.length;
  const closed = rows.filter(r => r['Status'] === 'Closed').length;
  const pct = (closed / total) * 100;
  const sla = rows.reduce((s, r) => s + (parseFloat(r['ACH SLA']) || 0), 0) / total;
  const puas = rows.reduce((s, r) => s + (parseFloat(r['Tingkat Kepuasan']) || 0), 0) / total;
  
  const cConv = getScale(pct, 'closed');
  const sConv = getScale(sla, 'sla');
  const pConv = getScale(puas, 'puas');
  
  // Weight: 30% Closed, 40% SLA, 20% Kepuasan
  const finalScore = (cConv * 0.3) + (sConv * 0.4) + (pConv * 0.2);
  
  return {
    total, clsd: closed, pct: pct.toFixed(1) + "%",
    cConv: cConv.toFixed(2), sla: sla.toFixed(1),
    sConv: sConv.toFixed(2), puas: puas.toFixed(1),
    pConv: pConv.toFixed(2), score: finalScore.toFixed(2)
  };
}

// ==========================================
// SEARCH LOGIC
// ==========================================
function tableSearch(input, bodyId) {
  const filter = input.value.toUpperCase();
  const rows = document.getElementById(bodyId).getElementsByTagName("tr");
  for (let i = 0; i < rows.length; i++) {
    rows[i].style.display = rows[i].innerText.toUpperCase().includes(filter) ? "" : "none";
  }
}

// ==========================================
// VIEW NAVIGATION
// ==========================================
function showHome() {
  document.getElementById('view-home').classList.remove('hidden');
  document.getElementById('view-dept').classList.add('hidden');
  document.querySelectorAll('.dept-item').forEach(el => el.classList.remove('active-dept'));

  const g = calc(rawData);
  
  // Render 9 Box Metrics
  const labels = [
    ["Total Problem", g.total, "slate-600"],
    ["Total Closed", g.clsd, "emerald-600"],
    ["% Closed", g.pct, "emerald-700"],
    ["Nilai Konversi (C)", g.cConv, "emerald-500"],
    ["Avg SLA", g.sla, "blue-600"],
    ["Nilai Konversi (S)", g.sConv, "blue-500"],
    ["Avg Kepuasan", g.puas, "amber-600"],
    ["Nilai Konversi (K)", g.pConv, "amber-500"],
    ["Score Layanan", g.score, "indigo-600 font-black text-2xl"]
  ];

  document.getElementById('home-metrics').innerHTML = labels.map(l => `
    <div class="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
      <p class="text-[9px] font-bold text-slate-400 uppercase mb-1">${l[0]}</p>
      <p class="text-xl font-bold text-${l[2]}">${l[1]}</p>
    </div>
  `).join('');

  // Render Global Tables
  renderSubTable(rawData, 'Nama Problem', 'home-table-prob');
  renderSubTable(rawData, 'Nama Solve', 'home-table-pic');
  renderGlobalWarning(rawData);
}

function showDept(name, el, rank) {
  document.getElementById('view-home').classList.add('hidden');
  document.getElementById('view-dept').classList.remove('hidden');
  document.querySelectorAll('.dept-item').forEach(i => i.classList.remove('active-dept'));
  el.classList.add('active-dept');

  const filtered = rawData.filter(r => r['Departemen'] === name);
  const m = calc(filtered);

  document.getElementById('dept-label-name').innerText = name;
  document.getElementById('dept-label-rank').innerText = `RANK #${rank}`;
  document.getElementById('dept-label-score').innerText = m.score;

  renderSubTable(filtered, 'Nama Problem', 'dept-table-prob');
  renderSubTable(filtered, 'Nama Solve', 'dept-table-pic');
}

// ==========================================
// RENDER HELPERS
// ==========================================
function renderSubTable(data, key, bodyId) {
  const groups = {};
  data.forEach(r => {
    const k = r[key] || 'Unassigned';
    if (!groups[k]) groups[k] = [];
    groups[k].push(r);
  });

  const sorted = Object.keys(groups).map(k => ({
    name: k, ...calc(groups[k])
  })).sort((a,b) => b.total - a.total).slice(0, 15);

  document.getElementById(bodyId).innerHTML = sorted.map(i => `
    <tr>
      <td class="p-2 font-medium">${i.name}</td>
      <td class="p-2">${i.total}</td>
      <td class="p-2 font-bold text-indigo-600">${i.score}</td>
    </tr>
  `).join('');
}

function renderGlobalWarning(data) {
  const warn = data.filter(r => r['Status'] !== 'Closed').map(r => {
    const u = parseFloat(r['Umur Problem']) || 0;
    const t = parseFloat(r['Target Hari']) || 0;
    let label = ''; let color = '';
    if (u > t) { label = 'OVER'; color = 'bg-red-500 text-white'; }
    else if (u >= t - 0.5) { label = 'NEAR'; color = 'bg-amber-500 text-white'; }
    return { ...r, u, t, label, color };
  }).filter(r => r.label !== '').sort((a,b) => b.u - a.u).slice(0, 20);

  document.getElementById('home-table-warn').innerHTML = warn.map(r => `
    <tr>
      <td class="p-2 font-bold text-[9px] uppercase">${r['Departemen']}</td>
      <td class="p-2 font-mono">${r['No Problem']}</td>
      <td class="p-2 truncate max-w-[150px]">${r['Nama Problem']}</td>
      <td class="p-2 text-slate-500">${r['Nama Solve']}</td>
      <td class="p-2 font-bold">${r.u}/${r.t}</td>
      <td class="p-2"><span class="px-1.5 py-0.5 rounded text-[8px] font-black ${r.color}">${r.label}</span></td>
    </tr>
  `).join('');
}

// ==========================================
// INIT
// ==========================================
async function init() {
  try {
    const res = await fetch(API_URL);
    rawData = await res.json();
    
    const depts = [...new Set(rawData.map(r => r['Departemen']))].filter(n => n && n.trim() !== '');
    deptRankings = depts.map(n => ({
      name: n, ...calc(rawData.filter(r => r['Departemen'] === n))
    })).sort((a,b) => b.score - a.score);

    document.getElementById('dept-list').innerHTML = deptRankings.map((d, i) => `
      <div onclick="showDept('${d.name.replace(/'/g, "\\'")}', this, ${i + 1})" 
           class="dept-item cursor-pointer p-3 rounded-lg transition-all border border-transparent hover:bg-slate-50 mb-1">
        <div class="flex justify-between items-center text-[9px] mb-1">
          <span class="text-slate-400 font-bold">RANK #${i + 1}</span>
          <span class="bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded font-black">${d.score}</span>
        </div>
        <h3 class="text-[11px] uppercase truncate">${d.name}</h3>
      </div>
    `).join('');

    showHome();
  } catch (e) {
    document.getElementById('dept-list').innerHTML = `<div class="p-4 text-red-500 text-[10px]">Gagal memuat API. Pastikan URL benar & akses 'Anyone'.</div>`;
  }
}

document.addEventListener('DOMContentLoaded', init);
