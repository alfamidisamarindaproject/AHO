const API_URL = "https://script.google.com/macros/s/AKfycbysHwfyLELuu8_8Ee6O12ihLS21Rfk6kguZ5m_1XXqdED2T22KV6DLjxyoHWbgLMYH1/exec"; 

let masterData = [];
let rankList = [];

// ==========================================
// RUMUS PERHITUNGAN (LOGIKA TETAP)
// ==========================================
function convertToScale(val, type) {
  if (type === 'closed') {
    if (val < 85) return 1;
    if (val >= 100) return 4;
    return 1 + ((val - 85) / 14.99) * 2.99;
  }
  if (type === 'sla') {
    if (val < 85) return 1;
    if (val >= 130) return 4;
    return 1 + ((val - 85) / 44.99) * 2.99;
  }
  if (type === 'puas') {
    if (val < 1) return 1;
    if (val >= 4) return 4;
    return 1 + ((val - 1) / 3) * 2.99;
  }
  return 1;
}

function calcMetrics(rows) {
  if (!rows || rows.length === 0) return { score: "0.00", closedRaw: "0%", slaRaw: 0, count: 0 };
  
  const total = rows.length;
  const closedCount = rows.filter(r => r['Status'] === 'Closed').length;
  const closedPct = (closedCount / total) * 100;
  const avgSla = rows.reduce((s, r) => s + (parseFloat(r['ACH SLA']) || 0), 0) / total;
  const avgPuas = rows.reduce((s, r) => s + (parseFloat(r['Tingkat Kepuasan']) || 0), 0) / total;
  
  const finalScore = (convertToScale(closedPct, 'closed') * 0.3) + 
                     (convertToScale(avgSla, 'sla') * 0.4) + 
                     (convertToScale(avgPuas, 'puas') * 0.2);
                     
  return {
    score: finalScore.toFixed(2),
    closedRaw: closedPct.toFixed(1) + "%",
    slaRaw: avgSla.toFixed(1),
    count: total
  };
}

// ==========================================
// NAVIGASI
// ==========================================
function showOverview() {
  document.getElementById('container-overview').classList.remove('hidden');
  document.getElementById('container-detail').classList.add('hidden');
  document.querySelectorAll('.dept-item').forEach(el => el.classList.remove('active-dept'));

  const global = calcMetrics(masterData);
  
  // Update Cards
  document.getElementById('stat-cards').innerHTML = `
    <div class="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
      <p class="text-[10px] font-bold text-slate-400 uppercase">Total Ticket</p>
      <p class="text-3xl font-black">${global.count}</p>
    </div>
    <div class="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm border-l-4 border-l-emerald-500">
      <p class="text-[10px] font-bold text-slate-400 uppercase">Closed Avg</p>
      <p class="text-3xl font-black text-emerald-600">${global.closedRaw}</p>
    </div>
    <div class="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm border-l-4 border-l-blue-500">
      <p class="text-[10px] font-bold text-slate-400 uppercase">SLA Avg</p>
      <p class="text-3xl font-black text-blue-600">${global.slaRaw}</p>
    </div>
    <div class="bg-indigo-600 p-6 rounded-2xl shadow-lg text-white">
      <p class="text-[10px] font-bold opacity-70 uppercase">Global Score</p>
      <p class="text-3xl font-black italic">${global.score}</p>
    </div>
  `;

  // Update Bars
  document.getElementById('progress-bars').innerHTML = rankList.map(d => `
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

function openDetail(deptName, element, rank) {
  document.getElementById('container-overview').classList.add('hidden');
  document.getElementById('container-detail').classList.remove('hidden');
  
  document.querySelectorAll('.dept-item').forEach(el => el.classList.remove('active-dept'));
  element.classList.add('active-dept');

  const filtered = masterData.filter(r => r['Departemen'] === deptName);
  const m = calcMetrics(filtered);

  document.getElementById('det-name').innerText = deptName;
  document.getElementById('det-rank').innerText = `RANK #${rank}`;
  document.getElementById('det-score').innerText = m.score;

  renderDetailTable(filtered, 'Nama Problem', 'body-prob');
  renderDetailTable(filtered, 'Nama Solve', 'body-pic');
  renderWarning(filtered);
}

// ==========================================
// RENDER TABEL & SEARCH
// ==========================================
function renderDetailTable(data, groupKey, tableId) {
  const groups = {};
  data.forEach(r => {
    const k = r[groupKey] || 'N/A';
    if (!groups[k]) groups[k] = [];
    groups[k].push(r);
  });

  const sorted = Object.keys(groups).map(k => ({
    name: k, ...calcMetrics(groups[k])
  })).sort((a,b) => b.count - a.count);

  document.getElementById(tableId).innerHTML = sorted.map(i => `
    <tr>
      <td class="p-3 font-bold">${i.name} (${i.count})</td>
      <td class="p-3">${i.closedRaw}</td>
      <td class="p-3">${i.slaRaw}</td>
      <td class="p-3 font-black text-indigo-600 italic">${i.score}</td>
    </tr>
  `).join('');
}

function renderWarning(data) {
  const critical = data.filter(r => r['Status'] !== 'Closed').map(r => {
    const u = parseFloat(r['Umur Problem']) || 0;
    const t = parseFloat(r['Target Hari']) || 0;
    let label = ''; let color = '';
    if (u > t) { label = 'OVER'; color = 'bg-red-500 text-white'; }
    else if (u >= t - 1) { label = 'NEAR'; color = 'bg-amber-500 text-white'; }
    return { ...r, u, t, label, color };
  }).filter(r => r.label !== '').sort((a,b) => b.u - a.u);

  document.getElementById('body-warn').innerHTML = critical.map(r => `
    <tr>
      <td class="p-3 font-mono font-bold">${r['No Problem']}</td>
      <td class="p-3">${r['Nama Problem']}</td>
      <td class="p-3 text-slate-500">${r['Nama Solve']}</td>
      <td class="p-3 font-black">${r.u} / ${r.t} H</td>
      <td class="p-3"><span class="px-2 py-0.5 rounded text-[9px] font-black ${r.color}">${r.label}</span></td>
    </tr>
  `).join('');
}

function searchTable(input, tableId) {
  const filter = input.value.toUpperCase();
  const rows = document.getElementById(tableId).getElementsByTagName("tr");
  for (let i = 0; i < rows.length; i++) {
    rows[i].style.display = rows[i].innerText.toUpperCase().includes(filter) ? "" : "none";
  }
}

// ==========================================
// INISIALISASI
// ==========================================
async function init() {
  try {
    const res = await fetch(API_URL);
    masterData = await res.json();
    
    // Cek apakah data kosong
    if (masterData.error) throw new Error(masterData.error);

    const depts = [...new Set(masterData.map(r => r['Departemen']))].filter(n => n && n.trim() !== '');
    
    rankList = depts.map(name => {
      return { name, ...calcMetrics(masterData.filter(r => r['Departemen'] === name)) };
    }).sort((a,b) => b.score - a.score);

    document.getElementById('dept-list').innerHTML = rankList.map((d, i) => `
      <div onclick="openDetail('${d.name.replace(/'/g, "\\'")}', this, ${i + 1})" 
           class="dept-item cursor-pointer p-4 rounded-xl transition-all hover:bg-slate-50 mb-1 border border-slate-100 bg-white">
        <div class="flex justify-between items-center mb-1">
          <span class="text-[9px] font-black text-slate-400 uppercase">Rank #${i + 1}</span>
          <span class="text-xs font-black bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded">${d.score}</span>
        </div>
        <h3 class="text-sm font-bold text-slate-700 uppercase italic truncate">${d.name}</h3>
      </div>
    `).join('');

    showOverview(); // Panggil Gambaran Besar otomatis

  } catch (err) {
    document.getElementById('dept-list').innerHTML = `<div class="p-4 text-red-500 text-xs font-bold">Error: URL API Salah atau Deploy Bukan 'Anyone'.</div>`;
  }
}

document.addEventListener('DOMContentLoaded', init);
