const API_URL = "https://script.google.com/macros/s/AKfycbyeRflk_DvJ89wjAOYMgu_vGD58Wve2J8EhF9jmqz181RAdCh3ecJREXGI8Zqrkeh_z/exec"; 

let dbData = [];
let rankedDepts = [];

// ==========================================
// RUMUS PERHITUNGAN (TIDAK BERUBAH)
// ==========================================
function getScaleValue(val, type) {
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

function calculateAllMetrics(rows) {
  if (!rows || rows.length === 0) return { score: "0.00", closedRaw: "0%", slaRaw: 0, count: 0 };
  
  const total = rows.length;
  const closedCount = rows.filter(r => r['Status'] === 'Closed').length;
  const closedPct = (closedCount / total) * 100;
  
  const avgSla = rows.reduce((s, r) => s + (parseFloat(r['ACH SLA']) || 0), 0) / total;
  const avgPuas = rows.reduce((s, r) => s + (parseFloat(r['Tingkat Kepuasan']) || 0), 0) / total;
  
  const score = (getScaleValue(closedPct, 'closed') * 0.3) + 
                (getScaleValue(avgSla, 'sla') * 0.4) + 
                (getScaleValue(avgPuas, 'puas') * 0.2);
                
  return {
    score: score.toFixed(2),
    closedRaw: closedPct.toFixed(1) + "%",
    slaRaw: avgSla.toFixed(1),
    count: total
  };
}

// ==========================================
// NAVIGASI: HOME & DETAIL
// ==========================================
function showOverview() {
  document.getElementById('view-overview').classList.remove('hidden');
  document.getElementById('view-detail').classList.add('hidden');
  
  // Hilangkan highlight di sidebar
  document.querySelectorAll('.dept-item').forEach(el => el.classList.remove('active-dept'));

  const global = calculateAllMetrics(dbData);
  
  // Update Box Statistik Atas
  document.getElementById('overview-stats').innerHTML = `
    <div class="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
      <p class="text-[10px] font-bold text-slate-400 uppercase mb-1">Total Tiket Masuk</p>
      <p class="text-3xl font-black">${global.count}</p>
    </div>
    <div class="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm border-l-4 border-l-emerald-500">
      <p class="text-[10px] font-bold text-slate-400 uppercase mb-1">Rata-rata Closed</p>
      <p class="text-3xl font-black text-emerald-600">${global.closedRaw}</p>
    </div>
    <div class="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm border-l-4 border-l-blue-500">
      <p class="text-[10px] font-bold text-slate-400 uppercase mb-1">Rata-rata SLA</p>
      <p class="text-3xl font-black text-blue-600">${global.slaRaw}</p>
    </div>
    <div class="bg-indigo-600 p-6 rounded-2xl shadow-lg text-white">
      <p class="text-[10px] font-bold opacity-70 uppercase mb-1">Global Performance Score</p>
      <p class="text-3xl font-black italic">${global.score}</p>
    </div>
  `;

  // Update Progress Bars Comparison
  document.getElementById('overview-bars').innerHTML = rankedDepts.map(d => `
    <div class="group cursor-pointer" onclick="openFromBar('${d.name.replace(/'/g, "\\'")}')">
      <div class="flex justify-between text-[10px] font-bold mb-1 uppercase italic group-hover:text-indigo-600">
        <span>${d.name}</span>
        <span>${d.score} / 4.00</span>
      </div>
      <div class="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
        <div class="bg-indigo-500 h-full transition-all duration-1000" style="width: ${(d.score/4)*100}%"></div>
      </div>
    </div>
  `).join('');
}

function openFromBar(name) {
  // Mencari elemen sidebar yang sesuai dan klik
  const items = document.querySelectorAll('.dept-item h3');
  items.forEach(h3 => {
    if(h3.innerText === name) h3.parentElement.click();
  });
}

function selectDepartment(deptName, el, rank) {
  // Navigasi Tampilan
  document.getElementById('view-overview').classList.add('hidden');
  document.getElementById('view-detail').classList.remove('hidden');
  
  // Sidebar Highlight
  document.querySelectorAll('.dept-item').forEach(i => i.classList.remove('active-dept'));
  el.classList.add('active-dept');

  // Reset Input Search
  document.querySelectorAll('input').forEach(i => i.value = '');

  const filtered = dbData.filter(r => r['Departemen'] === deptName);
  const metrics = calculateAllMetrics(filtered);

  document.getElementById('det-name').innerText = deptName;
  document.getElementById('det-rank').innerText = `RANK #${rank}`;
  document.getElementById('det-score').innerText = metrics.score;

  // Render Tabel-Tabel Detail
  renderSubTable(filtered, 'Nama Problem', 'table-prob');
  renderSubTable(filtered, 'Nama Solve', 'table-pic');
  renderWarningTable(filtered);
}

// ==========================================
// RENDER TABEL & SEARCH
// ==========================================
function renderSubTable(data, key, tableId) {
  const groups = {};
  data.forEach(r => {
    const k = r[key] || 'Unassigned';
    if (!groups[k]) groups[k] = [];
    groups[k].push(r);
  });

  const sorted = Object.keys(groups).map(k => ({
    name: k, ...calculateAllMetrics(groups[k])
  })).sort((a, b) => b.count - a.count);

  document.getElementById(tableId).innerHTML = sorted.map(i => `
    <tr>
      <td class="p-3 font-bold text-slate-700">${i.name} <span class="text-[9px] font-normal text-slate-400">(${i.count})</span></td>
      <td class="p-3">${i.closedRaw}</td>
      <td class="p-3">${i.slaRaw}</td>
      <td class="p-3 font-black text-indigo-600 italic">${i.score}</td>
    </tr>
  `).join('');
}

function renderWarningTable(data) {
  const critical = data.filter(r => r['Status'] !== 'Closed').map(r => {
    const umur = parseFloat(r['Umur Problem']) || 0;
    const target = parseFloat(r['Target Hari']) || 0;
    let label = ''; let color = '';
    if (umur > target) { label = 'MELEBIHI'; color = 'bg-red-500 text-white'; }
    else if (umur >= target - 1) { label = 'MENDEKATI'; color = 'bg-amber-500 text-white'; }
    return { ...r, umur, target, label, color };
  }).filter(r => r.label !== '').sort((a,b) => b.umur - a.umur);

  document.getElementById('table-warn').innerHTML = critical.map(r => `
    <tr>
      <td class="p-3 font-mono font-bold">${r['No Problem']}</td>
      <td class="p-3">${r['Nama Problem']}</td>
      <td class="p-3 text-slate-500">${r['Nama Solve']}</td>
      <td class="p-3 font-black">${r.umur} / ${r.target} Hari</td>
      <td class="p-3"><span class="px-2 py-0.5 rounded text-[9px] font-black ${r.color}">${r.label}</span></td>
    </tr>
  `).join('');
}

function doSearch(input, tableId) {
  const filter = input.value.toUpperCase();
  const rows = document.getElementById(tableId).getElementsByTagName("tr");
  for (let i = 0; i < rows.length; i++) {
    rows[i].style.display = rows[i].innerText.toUpperCase().includes(filter) ? "" : "none";
  }
}

// ==========================================
// INITIALIZATION
// ==========================================
async function init() {
  try {
    const res = await fetch(API_URL);
    dbData = await res.json();
    
    // Ambil 13 Departemen Unik
    const depts = [...new Set(dbData.map(r => r['Departemen']))].filter(n => n && n.trim() !== '');
    
    rankedDepts = depts.map(name => {
      const filtered = dbData.filter(r => r['Departemen'] === name);
      return { name, ...calculateAllMetrics(filtered) };
    }).sort((a, b) => b.score - a.score);

    // Render Sidebar
    document.getElementById('dept-list').innerHTML = rankedDepts.map((d, i) => `
      <div onclick="selectDepartment('${d.name.replace(/'/g, "\\'")}', this, ${i + 1})" 
           class="dept-item cursor-pointer p-4 rounded-xl border border-transparent transition-all hover:bg-slate-50 mb-1 shadow-sm border-slate-100 bg-white">
        <div class="flex justify-between items-center mb-1">
          <span class="text-[9px] font-black text-slate-400 uppercase">Rank #${i + 1}</span>
          <span class="text-xs font-black bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded">${d.score}</span>
        </div>
        <h3 class="text-sm font-bold text-slate-700 uppercase italic truncate">${d.name}</h3>
      </div>
    `).join('');

    // Jalankan Overview pertama kali
    showOverview();

  } catch (err) {
    document.getElementById('dept-list').innerHTML = `<div class="p-4 text-red-500 font-bold">Gagal memuat data API!</div>`;
  }
}

document.addEventListener('DOMContentLoaded', init);
