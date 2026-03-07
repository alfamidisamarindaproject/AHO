const API_URL = "https://script.google.com/macros/s/AKfycbxMeXvqBc5aW_0P89u5mf1uRQKyIe2lcLIJks75qpVQoFdd4ismc4Ri7gTlT4m4MB7E/exec"; 

let rawData = [];
let rankedDepts = [];

// Helper Parsing Angka
const parseNum = (val) => {
  if (!val) return 0;
  const str = String(val).replace(',', '.').replace(/[^0-9.-]/g, '');
  return parseFloat(str) || 0;
};

// HELPER BARU: Parsing Tanggal (Format DD/MM/YYYY HH:mm:ss) dan Hitung Selisih Hari s/d Sekarang
function calculateAgeInDays(row) {
  const tglEskalasi = row['Tgl Eskalasi'];
  const tglProblem = row['Tgl Problem'];
  
  // Ambil eskalasi jika ada, jika tidak ambil tgl problem
  const dateStr = (tglEskalasi && String(tglEskalasi).trim() !== '') ? String(tglEskalasi) : String(tglProblem);
  
  if (!dateStr || dateStr === 'undefined') return 0;

  try {
    // Parsing manual format DD/MM/YYYY
    const parts = dateStr.split(' ');
    const dateParts = parts[0].split('/');
    if (dateParts.length !== 3) return 0;
    
    // year, month (0-index), day, hour, min, sec
    const timeParts = parts[1] ? parts[1].split(':') : [0, 0, 0];
    const startDate = new Date(dateParts[2], dateParts[1] - 1, dateParts[0], timeParts[0] || 0, timeParts[1] || 0, timeParts[2] || 0);
    const now = new Date();
    
    const diffMs = now - startDate;
    if (diffMs < 0) return 0;
    
    // Konversi ke hari (dibulatkan ke bawah)
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  } catch (e) {
    return 0;
  }
}

// Rumus Skala (1-4)
function getScale(value, type) {
  if (type === 'closed') return value < 85 ? 1 : (value >= 100 ? 4 : 1 + ((value - 85) / 14.99) * 2.99);
  if (type === 'sla')    return value < 85 ? 1 : (value >= 130 ? 4 : 1 + ((value - 85) / 44.99) * 2.99);
  if (type === 'puas')   return value >= 4 ? 4 : (value <= 1 ? 1 : 1 + ((value - 1) / 3) * 2.99);
  return 1;
}

// Kalkulasi Metrik
function calculateMetrics(records) {
  const t = records.length;
  if (t === 0) return { total:0, closed:0, pct:"0.0", convC:"1.00", sla:"0.0", convS:"1.00", puas:"0.0", convK:"1.00", final:"0.00" };
  
  const closedCount = records.filter(r => String(r['Status'] || '').trim().toLowerCase() === 'closed').length;
  const pctClosed = (closedCount / t) * 100;
  const avgSla = records.reduce((sum, r) => sum + parseNum(r['ACH SLA']), 0) / t;
  const avgPuas = records.reduce((sum, r) => sum + parseNum(r['Tingkat Kepuasan']), 0) / t;
  
  const convC = getScale(pctClosed, 'closed');
  const convS = getScale(avgSla, 'sla');
  const convK = getScale(avgPuas, 'puas');
  
  const finalScore = (convC * 0.3) + (convS * 0.5) + (convK * 0.2);
  
  return {
    total: t, closed: closedCount, pct: pctClosed.toFixed(1), convC: convC.toFixed(2),
    sla: avgSla.toFixed(1), convS: convS.toFixed(2), puas: avgPuas.toFixed(1), convK: convK.toFixed(2),
    final: finalScore.toFixed(2)
  };
}

// RENDER TABEL DETAIL (MASALAH & PIC)
function renderDetailTable(data, groupKey, tableId) {
  const tbody = document.getElementById(tableId);
  if (!tbody) return;

  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="p-6 text-center text-slate-400 italic">Tidak ada data</td></tr>`;
    return;
  }

  const groups = {};
  data.forEach(row => {
    const key = String(row[groupKey] || '').trim() || 'Tidak Terdefinisi';
    if (!groups[key]) groups[key] = [];
    groups[key].push(row);
  });
  
  const resultArr = Object.keys(groups)
    .map(key => ({ name: key, ...calculateMetrics(groups[key]) }))
    .sort((a, b) => b.total - a.total).slice(0, 30);
  
  tbody.innerHTML = resultArr.map(i => `
    <tr class="hover:bg-slate-50 transition-colors">
      <td class="p-3 font-semibold text-slate-700 truncate max-w-[150px]" title="${i.name}">${i.name}</td>
      <td class="p-3 text-center font-medium">${i.total}</td>
      <td class="p-3 text-center text-emerald-600 font-medium">${i.closed}</td>
      <td class="p-3 text-center text-slate-400">${i.pct}%</td>
      <td class="p-3 text-center text-blue-600 font-medium">${i.sla}</td>
      <td class="p-3 text-center text-amber-600 font-medium">${i.puas}</td>
      <td class="p-3 text-center font-black text-indigo-600 bg-indigo-50/30">${i.final}</td>
    </tr>
  `).join('');
}

// LOGIKA BARU UNTUK RENDER TABEL WARNING (CRITICAL)
function renderWarningTable(data, tableId) {
  const tbody = document.getElementById(tableId);
  if (!tbody) return;

  // Filter hanya yang belum Closed
  const unclosed = data.filter(d => String(d['Status'] || '').trim().toLowerCase() !== 'closed');
  
  const critical = unclosed.map(d => {
    const umurRealtime = calculateAgeInDays(d); // Logic hitung dari Tgl Problem / Eskalasi
    const target = parseNum(d['Target Hari']);
    
    let label = ''; 
    let badge = '';
    
    if (umurRealtime > target) { 
        label = 'OVER'; 
        badge = 'bg-red-500'; 
    } else if (umurRealtime >= target - 1 && target > 0) { 
        label = 'WARN'; 
        badge = 'bg-amber-400'; 
    }
    
    return { ...d, umur: umurRealtime, target, label, badge };
  })
  .filter(d => d.label !== '') // Hanya tampilkan yang OVER atau WARN
  .sort((a, b) => (b.umur - b.target) - (a.umur - a.target))
  .slice(0, 50);

  if (critical.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-slate-400 italic">Semua aman</td></tr>`;
    return;
  }
  
  tbody.innerHTML = critical.map(d => `
    <tr class="text-[9px] hover:bg-red-50/30 transition-colors">
      <td class="p-3 font-bold text-slate-400">${d['Departemen'] || '-'}</td>
      <td class="p-3 font-mono font-bold text-indigo-600">${d['No Problem'] || '-'}</td>
      <td class="p-3 truncate max-w-[100px]" title="${d['Nama Penangung']}">${d['Nama Penangung'] || '-'}</td>
      <td class="p-3 text-center font-bold text-slate-700">${d.umur} / ${d.target} Hari</td>
      <td class="p-3 text-center"><span class="${d.badge} text-white px-2 py-0.5 rounded-full text-[8px] font-black">${d.label}</span></td>
    </tr>
  `).join('');
}

// Render Kotak Metrik
function renderMetrikBox(containerId, m) {
  const container = document.getElementById(containerId);
  if(!container) return;

  const layout = [
    ["Total Ticket", m.total, "text-slate-600"],
    ["Closed", m.closed, "text-emerald-600"],
    ["% Closed", m.pct + "%", "text-emerald-600"],
    ["Konv (C)", m.convC, "text-emerald-400"],
    ["Avg SLA", m.sla, "text-blue-600"],
    ["Konv (S)", m.convS, "text-blue-400"],
    ["Avg Puas", m.puas, "text-amber-600"],
    ["Konv (K)", m.convK, "text-amber-400"],
    ["Score Layanan", m.final, "text-white"]
  ];

  container.innerHTML = layout.map((item, i) => `
    <div class="${i === 8 ? 'bg-indigo-600 shadow-lg' : 'bg-white border border-slate-100'} p-3 rounded-xl">
      <p class="text-[8px] font-bold ${i === 8 ? 'text-indigo-200' : 'text-slate-400'} uppercase">${item[0]}</p>
      <p class="text-lg font-black italic ${item[2]}">${item[1]}</p>
    </div>
  `).join('');
}

// Navigasi
function showHome() {
  document.getElementById('view-home').classList.remove('hidden');
  document.getElementById('view-dept').classList.add('hidden');
  document.getElementById('btn-home').classList.add('nav-item-active');
  document.querySelectorAll('.dept-item').forEach(e => e.classList.remove('active-dept'));

  const m = calculateMetrics(rawData);
  renderMetrikBox('home-metrics', m);
  renderDetailTable(rawData, 'Nama Problem', 'home-body-prob');
  renderDetailTable(rawData, 'Nama Penangung', 'home-body-pic');
  renderWarningTable(rawData, 'home-body-warn');
}

function selectDept(deptName, el, rank) {
  document.getElementById('view-home').classList.add('hidden');
  document.getElementById('view-dept').classList.remove('hidden');
  document.getElementById('btn-home').classList.remove('nav-item-active');
  
  document.querySelectorAll('.dept-item').forEach(e => e.classList.remove('active-dept'));
  el.classList.add('active-dept');
  
  const deptData = rawData.filter(d => String(d.Departemen).trim() === deptName);
  const m = calculateMetrics(deptData);
  
  document.getElementById('det-name').innerText = deptName;
  document.getElementById('det-rank').innerText = `RANK #${rank}`;
  document.getElementById('det-score').innerText = m.final;
  
  renderMetrikBox('dept-metrics', m);
  renderDetailTable(deptData, 'Nama Problem', 'dept-body-prob');
  renderDetailTable(deptData, 'Nama Penangung', 'dept-body-pic');
  
  if(window.innerWidth < 1024) toggleSidebar();
}

// Fungsi Search Universal
function doSearch(input, tableId) {
  const filter = input.value.toUpperCase();
  const rows = document.getElementById(tableId).getElementsByTagName("tr");
  for (let i = 0; i < rows.length; i++) {
    rows[i].style.display = rows[i].innerText.toUpperCase().includes(filter) ? "" : "none";
  }
}

async function init() {
  const listEl = document.getElementById('dept-list');
  try {
    const res = await fetch(API_URL);
    const data = await res.json();
    rawData = data.filter(r => r.Departemen && String(r.Departemen).trim() !== '');
    
    document.getElementById('global-last-update').innerText = new Date().toLocaleString('id-ID');
    
    const uniqueDepts = [...new Set(rawData.map(d => String(d.Departemen).trim()))];
    rankedDepts = uniqueDepts.map(name => {
      return { name, ...calculateMetrics(rawData.filter(d => String(d.Departemen).trim() === name)) };
    }).sort((a, b) => parseFloat(b.final) - parseFloat(a.final));
    
    listEl.innerHTML = rankedDepts.map((d, i) => `
      <div onclick="selectDept('${d.name.replace(/'/g, "\\'")}', this, ${i + 1})" 
           class="dept-item cursor-pointer p-3 rounded-xl hover:bg-slate-50 border-l-4 border-transparent transition-all group">
        <div class="flex justify-between items-center mb-1">
          <span class="text-[8px] font-bold text-slate-400 uppercase">Rank #${i + 1}</span>
          <span class="text-[10px] font-black text-indigo-600">${d.final}</span>
        </div>
        <h3 class="text-[10px] font-bold text-slate-700 uppercase truncate">${d.name}</h3>
      </div>
    `).join('');
    
    showHome();
  } catch (e) {
    listEl.innerHTML = `<div class="p-4 text-red-500 text-[10px]">Gagal memuat data.</div>`;
  }
}

document.addEventListener('DOMContentLoaded', init);
