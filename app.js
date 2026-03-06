const API_URL = "https://script.google.com/macros/s/AKfycbw-a5sMG8yTqykDQANqkdjaI_DaGjg3LmQpw03eAElq1hEm5E7WYjRtwwuc-0dbEXfg/exec"; // MASUKKAN URL HASIL DEPLOY DI SINI

let db = [];
let ranked = [];

// ==========================================
// RUMUS SKOR (30% Closed, 40% SLA, 20% Kepuasan)
// ==========================================
function getScale(val, type) {
  if (type === 'closed') {
    if (val < 85) return 1;
    if (val >= 100) return 4;
    return 1 + ((val - 85) / 15) * 3; // Interpolasi 1 - 4
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

function calculateScore(rows) {
  if (!rows || rows.length === 0) return { score: 0, closed: 0, sla: 0, puas: 0, total: 0 };
  
  const total = rows.length;
  const closedCount = rows.filter(r => r['Status'] === 'Closed').length;
  const closedPct = (closedCount / total) * 100;
  
  const avgSla = rows.reduce((s, r) => s + (parseFloat(r['ACH SLA']) || 0), 0) / total;
  const avgPuas = rows.reduce((s, r) => s + (parseFloat(r['Tingkat Kepuasan']) || 0), 0) / total;
  
  const finalScore = (getScale(closedPct, 'closed') * 0.3) + 
                     (getScale(avgSla, 'sla') * 0.4) + 
                     (getScale(avgPuas, 'puas') * 0.2);
  
  return {
    score: finalScore.toFixed(2),
    closed: closedPct.toFixed(1) + '%',
    sla: avgSla.toFixed(1),
    puas: avgPuas.toFixed(1),
    total: total
  };
}

// ==========================================
// FITUR SEARCH
// ==========================================
function doSearch(input, tableId) {
  const filter = input.value.toUpperCase();
  const rows = document.getElementById(tableId).getElementsByTagName("tr");
  for (let i = 0; i < rows.length; i++) {
    rows[i].style.display = rows[i].innerText.toUpperCase().includes(filter) ? "" : "none";
  }
}

// ==========================================
// RENDER OVERVIEW
// ==========================================
function showOverview() {
  document.getElementById('view-overview').classList.remove('hidden');
  document.getElementById('view-detail').classList.add('hidden');
  document.querySelectorAll('.dept-item').forEach(e => e.classList.remove('active-dept'));

  const global = calculateScore(db);
  document.getElementById('overview-stats').innerHTML = `
    <div class="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
      <p class="text-[10px] font-bold text-slate-400 uppercase mb-1">Total Problem</p>
      <p class="text-3xl font-black">${global.total}</p>
    </div>
    <div class="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm border-l-4 border-l-emerald-500">
      <p class="text-[10px] font-bold text-slate-400 uppercase mb-1">Rata-rata Closed</p>
      <p class="text-3xl font-black text-emerald-600">${global.closed}</p>
    </div>
    <div class="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm border-l-4 border-l-blue-500">
      <p class="text-[10px] font-bold text-slate-400 uppercase mb-1">Rata-rata SLA</p>
      <p class="text-3xl font-black text-blue-600">${global.sla}</p>
    </div>
    <div class="bg-indigo-600 p-6 rounded-2xl shadow-lg text-white">
      <p class="text-[10px] font-bold opacity-70 uppercase mb-1">Global Performance Score</p>
      <p class="text-3xl font-black italic">${global.score}</p>
    </div>
  `;

  document.getElementById('overview-bars').innerHTML = ranked.map(d => `
    <div>
      <div class="flex justify-between text-[10px] font-bold mb-1 uppercase italic">
        <span>${d.name}</span>
        <span class="text-indigo-600">${d.score} / 4.00</span>
      </div>
      <div class="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
        <div class="bg-indigo-500 h-full transition-all duration-1000" style="width: ${(d.score/4)*100}%"></div>
      </div>
    </div>
  `).join('');
}

// ==========================================
// RENDER DETAIL DEPARTEMEN
// ==========================================
function showDetail(deptName, el, rank) {
  document.querySelectorAll('.dept-item').forEach(e => e.classList.remove('active-dept'));
  el.classList.add('active-dept');
  document.getElementById('view-overview').classList.add('hidden');
  document.getElementById('view-detail').classList.remove('hidden');

  const deptData = db.filter(r => r['Departemen'] === deptName);
  const m = calculateScore(deptData);

  document.getElementById('det-name').innerText = deptName;
  document.getElementById('det-rank').innerText = `RANK #${rank}`;
  document.getElementById('det-score').innerText = m.score;

  // Render Table Problem
  renderSubTable(deptData, 'Nama Problem', 'table-prob');
  // Render Table PIC
  renderSubTable(deptData, 'Nama Solve', 'table-pic');
  // Render Warning Table
  renderWarningTable(deptData);
}

function renderSubTable(data, groupKey, tableId) {
  const groups = {};
  data.forEach(r => {
    const k = r[groupKey] || 'Unassigned';
    if (!groups[k]) groups[k] = [];
    groups[k].push(r);
  });

  const sorted = Object.keys(groups).map(k => ({
    name: k, ...calculateScore(groups[k])
  })).sort((a, b) => b.total - a.total);

  document.getElementById(tableId).innerHTML = sorted.map(i => `
    <tr class="hover:bg-slate-50">
      <td class="p-3 font-bold text-slate-700">${i.name} <span class="text-indigo-400 font-normal">(${i.total})</span></td>
      <td class="p-3">${i.closed}</td>
      <td class="p-3">${i.sla}</td>
      <td class="p-3 font-black text-indigo-600 italic">${i.score}</td>
    </tr>
  `).join('');
}

function renderWarningTable(data) {
  const unclosed = data.filter(r => r['Status'] !== 'Closed');
  const critical = unclosed.map(r => {
    const umur = parseFloat(r['Umur Problem']) || 0;
    const target = parseFloat(r['Target Hari']) || 0;
    let label = 'Aman';
    let color = 'bg-slate-100 text-slate-500';
    if (umur > target) { label = 'OVER'; color = 'bg-red-600 text-white'; }
    else if (umur >= target - 1) { label = 'NEAR'; color = 'bg-amber-500 text-white'; }
    return { ...r, umur, target, label, color };
  }).filter(r => r.label !== 'Aman').sort((a, b) => b.umur - a.umur);

  document.getElementById('table-warn').innerHTML = critical.map(r => `
    <tr>
      <td class="p-3 font-mono">${r['No Problem']}</td>
      <td class="p-3 font-bold">${r['Nama Problem']}</td>
      <td class="p-3">${r['Nama Solve']}</td>
      <td class="p-3 font-black">${r.umur} / ${r.target} Hr</td>
      <td class="p-3"><span class="px-2 py-0.5 rounded-full text-[9px] font-black ${r.color}">${r.label}</span></td>
    </tr>
  `).join('');
}

// ==========================================
// INIT APP
// ==========================================
async function init() {
  try {
    const res = await fetch(API_URL);
    db = await res.json();
    
    // Filter 13 Departemen Unik
    const uniqueDepts = [...new Set(db.map(r => r['Departemen']))].filter(n => n && n.trim() !== '');
    ranked = uniqueDepts.map(n => ({
      name: n, ...calculateScore(db.filter(r => r['Departemen'] === n))
    })).sort((a, b) => b.score - a.score);

    document.getElementById('dept-list').innerHTML = ranked.map((d, i) => `
      <div onclick="showDetail('${d.name.replace(/'/g, "\\'")}', this, ${i + 1})" 
           class="dept-item cursor-pointer p-4 rounded-xl border border-transparent transition-all group hover:bg-slate-50">
        <div class="flex justify-between items-center mb-1">
          <span class="text-[9px] font-black text-slate-400 uppercase">Rank #${i + 1}</span>
          <span class="text-xs font-black bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded">${d.score}</span>
        </div>
        <h3 class="text-sm font-bold text-slate-700 uppercase italic truncate">${d.name}</h3>
      </div>
    `).join('');

    showOverview();
  } catch (err) {
    document.getElementById('dept-list').innerHTML = `<div class="p-4 text-red-500 text-xs"><b>API ERROR:</b> Pastikan URL benar & Deployment 'Anyone'.</div>`;
  }
}

document.addEventListener('DOMContentLoaded', init);
