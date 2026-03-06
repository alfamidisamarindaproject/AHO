// PASTIKAN URL WEB APP INI SUDAH BENAR DAN DIAKSES SEBAGAI 'ANYONE'
const API_URL = "https://script.google.com/macros/s/AKfycbzbmSVPRD_VAn0CEeuV4EGIcMhFSkv2pXiziVUBU8d9dR0WUodv9bENWVNGkVEBh-tC/exec"; 

let rawData = [];
let rankedDepts = [];

// ==========================================
// 1. HELPER PARSING & KONVERSI SKOR
// ==========================================
// Mengubah string angka Indonesia (koma) jadi float internasional
const parseNum = (val) => parseFloat(String(val).replace(',', '.')) || 0;

// Rumus Skala (1-4)
function getScale(value, type) {
  if (type === 'closed') return value < 85 ? 1 : (value >= 100 ? 4 : 1 + ((value - 85) / 14.99) * 2.99);
  if (type === 'sla')    return value < 85 ? 1 : (value >= 130 ? 4 : 1 + ((value - 85) / 44.99) * 2.99);
  if (type === 'puas')   return value >= 4 ? 4 : (value <= 1 ? 1 : 1 + ((value - 1) / 3) * 2.99);
  return 1;
}

// ==========================================
// 2. MESIN PERHITUNGAN UTAMA (9 METRIK)
// ==========================================
function calculateMetrics(records) {
  const t = records.length;
  if (t === 0) return { total:0, closed:0, pct:"0.0", convC:"1.00", sla:"0.0", convS:"1.00", puas:"0.0", convK:"1.00", final:"0.00" };
  
  const closedCount = records.filter(r => String(r['Status']).trim().toLowerCase() === 'closed').length;
  const pctClosed = (closedCount / t) * 100;
  
  const avgSla = records.reduce((sum, r) => sum + parseNum(r['ACH SLA']), 0) / t;
  const avgPuas = records.reduce((sum, r) => sum + parseNum(r['Tingkat Kepuasan']), 0) / t;
  
  const convC = getScale(pctClosed, 'closed');
  const convS = getScale(avgSla, 'sla');
  const convK = getScale(avgPuas, 'puas');
  
  // Bobot: 30% Closed, 40% SLA, 20% Kepuasan (Anda bisa ganti *0.30 jika Kepuasan butuh 30%)
  const finalScore = (convC * 0.3) + (convS * 0.5) + (convK * 0.2);
  
  return {
    total: t, 
    closed: closedCount, 
    pct: pctClosed.toFixed(1), 
    convC: convC.toFixed(2),
    sla: avgSla.toFixed(1), 
    convS: convS.toFixed(2),
    puas: avgPuas.toFixed(1), 
    convK: convK.toFixed(2),
    final: finalScore.toFixed(2)
  };
}

// ==========================================
// 3. LOGIKA RENDER TABEL (7 KOLOM)
// ==========================================
function renderDetailTable(data, groupKey, tableId) {
  const groups = {};
  data.forEach(row => {
    const key = row[groupKey] || 'Unassigned';
    if (!groups[key]) groups[key] = [];
    groups[key].push(row);
  });
  
  const resultArr = Object.keys(groups)
    .map(key => ({ name: key, ...calculateMetrics(groups[key]) }))
    .sort((a, b) => b.total - a.total).slice(0, 30); // Ambil Top 30
  
  document.getElementById(tableId).innerHTML = resultArr.map(i => `
    <tr class="hover:bg-slate-50 transition-colors cursor-default">
      <td class="p-3 font-semibold text-slate-700 max-w-[200px] truncate" title="${i.name}">${i.name}</td>
      <td class="p-3 text-center font-medium">${i.total}</td>
      <td class="p-3 text-center text-emerald-600 font-medium">${i.closed}</td>
      <td class="p-3 text-center text-slate-500">${i.pct}%</td>
      <td class="p-3 text-center text-blue-600 font-medium">${i.sla}</td>
      <td class="p-3 text-center text-amber-600 font-medium">${i.puas}</td>
      <td class="p-3 text-center font-black text-indigo-600 bg-indigo-50/30">${i.final}</td>
    </tr>
  `).join('');
}

function renderWarningTable(data, tableId) {
  const unclosed = data.filter(d => String(d.Status).trim().toLowerCase() !== 'closed');
  
  const critical = unclosed.map(d => {
    const umur = parseNum(d['Umur Problem']);
    const target = parseNum(d['Target Hari']);
    
    let label = ''; let badgeColor = ''; let rowColor = '';
    if (umur > target) {
      label = 'OVER TARGET'; badgeColor = 'bg-red-500 text-white shadow-sm'; rowColor = 'bg-red-50/30 hover:bg-red-50/60';
    } else if (umur >= target - 1) {
      label = 'MENDEKATI'; badgeColor = 'bg-amber-400 text-white shadow-sm'; rowColor = 'bg-amber-50/30 hover:bg-amber-50/60';
    }
    return { ...d, umur, target, label, badgeColor, rowColor };
  }).filter(d => d.label !== '').sort((a, b) => (b.umur - b.target) - (a.umur - a.target)).slice(0, 50);

  if (critical.length === 0) {
    document.getElementById(tableId).innerHTML = `<tr><td colspan="6" class="p-6 text-center text-slate-400 font-bold italic">🎉 Yeay! Semua tiket terpantau aman.</td></tr>`;
    return;
  }
  
  document.getElementById(tableId).innerHTML = critical.map(d => `
    <tr class="${d.rowColor} transition-colors border-b border-white">
      <td class="p-3 font-bold text-[9px] uppercase text-slate-500">${d['Departemen']}</td>
      <td class="p-3 font-mono font-bold text-indigo-600">${d['No Problem']}</td>
      <td class="p-3 text-slate-700 font-medium truncate max-w-[200px]" title="${d['Nama Problem']}">${d['Nama Problem']}</td>
      <td class="p-3 text-slate-500">${d['Nama Solve']}</td>
      <td class="p-3 text-center font-bold text-slate-700">${d.umur} <span class="text-[10px] text-slate-400 font-normal">/ ${d.target}</span></td>
      <td class="p-3 text-center"><span class="px-2 py-1 rounded-md text-[8px] font-black tracking-wider ${d.badgeColor}">${d.label}</span></td>
    </tr>
  `).join('');
}

// ==========================================
// 4. NAVIGASI TAMPILAN
// ==========================================
function renderMetrikBox(containerId, m) {
  const layout = [
    ["Total Problem", m.total, "text-slate-600"],
    ["Total Closed", m.closed, "text-emerald-600"],
    ["% Closed", m.pct + "%", "text-emerald-600"],
    ["Konversi (C)", m.convC, "text-emerald-500"],
    ["Avg SLA", m.sla, "text-blue-600"],
    ["Konversi (S)", m.convS, "text-blue-500"],
    ["Avg Kepuasan", m.puas, "text-amber-600"],
    ["Konversi (K)", m.convK, "text-amber-500"],
    ["Score Layanan", m.final, "text-white"]
  ];

  document.getElementById(containerId).innerHTML = layout.map((item, i) => `
    <div class="${i === 8 ? 'bg-gradient-to-br from-indigo-600 to-indigo-500 shadow-md transform scale-105' : 'bg-white border border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)]'} p-4 rounded-2xl flex flex-col justify-center relative overflow-hidden">
      ${i === 8 ? '<div class="absolute -right-4 -top-4 w-16 h-16 bg-white/10 rounded-full blur-xl"></div>' : ''}
      <p class="text-[9px] font-bold ${i === 8 ? 'text-indigo-100' : 'text-slate-400'} uppercase tracking-wider mb-1 z-10">${item[0]}</p>
      <p class="text-2xl font-black italic ${item[2]} z-10">${item[1]}</p>
    </div>
  `).join('');
}

function showHome() {
  document.getElementById('view-home').classList.remove('hidden');
  document.getElementById('view-dept').classList.add('hidden');
  document.querySelectorAll('.dept-item').forEach(e => e.classList.remove('active-dept'));

  const globalMetrik = calculateMetrics(rawData);
  renderMetrikBox('home-metrics', globalMetrik);

  renderDetailTable(rawData, 'Nama Problem', 'home-body-prob');
  renderDetailTable(rawData, 'Nama Solve', 'home-body-pic');
  renderWarningTable(rawData, 'home-body-warn');
  
  // Kosongkan semua input pencarian
  document.querySelectorAll('input').forEach(i => i.value = '');
}

function selectDept(deptName, el, rank) {
  document.getElementById('view-home').classList.add('hidden');
  document.getElementById('view-dept').classList.remove('hidden');
  
  document.querySelectorAll('.dept-item').forEach(e => e.classList.remove('active-dept'));
  el.classList.add('active-dept');
  
  const deptData = rawData.filter(d => d.Departemen === deptName);
  const deptMetrik = calculateMetrics(deptData);
  
  document.getElementById('det-name').innerText = deptName;
  document.getElementById('det-rank').innerText = `RANK #${rank}`;
  document.getElementById('det-score').innerText = deptMetrik.final;
  
  renderMetrikBox('dept-metrics', deptMetrik);
  
  renderDetailTable(deptData, 'Nama Problem', 'dept-body-prob');
  renderDetailTable(deptData, 'Nama Solve', 'dept-body-pic');
  
  document.querySelectorAll('input').forEach(i => i.value = '');
}

// ==========================================
// 5. FITUR SEARCH
// ==========================================
function doSearch(input, tableId) {
  const filter = input.value.toUpperCase();
  const rows = document.getElementById(tableId).getElementsByTagName("tr");
  for (let i = 0; i < rows.length; i++) {
    rows[i].style.display = rows[i].innerText.toUpperCase().includes(filter) ? "" : "none";
  }
}

// ==========================================
// 6. INISIALISASI & FETCH DATA
// ==========================================
async function init() {
  const listEl = document.getElementById('dept-list');
  try {
    const res = await fetch(API_URL);
    if (!res.ok) throw new Error("Gagal mengambil data dari Google Script.");
    
    rawData = await res.json();
    if (rawData.error) throw new Error(rawData.error);
    
    const uniqueDepts = [...new Set(rawData.map(d => d.Departemen).filter(n => n && String(n).trim() !== ''))];
    
    rankedDepts = uniqueDepts.map(deptName => {
      return { name: deptName, ...calculateMetrics(rawData.filter(d => d.Departemen === deptName)) };
    });
    
    rankedDepts.sort((a, b) => parseFloat(b.final) - parseFloat(a.final));
    
    listEl.innerHTML = rankedDepts.map((d, index) => `
      <div onclick="selectDept('${d.name.replace(/'/g, "\\'")}', this, ${index + 1})" 
           class="dept-item cursor-pointer p-4 rounded-xl hover:bg-slate-100 transition-all group border border-transparent hover:border-slate-200">
        <div class="flex justify-between items-center mb-1.5">
          <span class="text-[9px] font-black text-slate-400 group-hover:text-indigo-500 uppercase tracking-widest">Rank #${index + 1}</span>
          <span class="text-xs font-black bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded shadow-sm">${d.final}</span>
        </div>
        <h3 class="text-xs font-bold text-slate-700 uppercase italic truncate">${d.name}</h3>
      </div>
    `).join('');
    
    showHome();
  } catch (error) {
    listEl.innerHTML = `
      <div class="p-4 bg-red-50 text-red-600 rounded-xl text-[10px] border border-red-100">
        <b>KONEKSI GAGAL!</b><br>
        Pastikan Web App di-deploy dengan akses "Anyone".
      </div>`;
  }
}

document.addEventListener('DOMContentLoaded', init);
