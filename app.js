const API_URL = "https://script.google.com/macros/s/AKfycbxMeXvqBc5aW_0P89u5mf1uRQKyIe2lcLIJks75qpVQoFdd4ismc4Ri7gTlT4m4MB7E/exec"; 

let rawData = [];
let filteredData = [];
let rankedDepts = [];
let activeDeptName = null;

// Helper Parsing Angka
const parseNum = (val) => {
  if (!val) return 0;
  const str = String(val).replace(',', '.').replace(/[^0-9.-]/g, '');
  return parseFloat(str) || 0;
};

// Helper Parsing Tanggal JS dari format DD/MM/YYYY HH:mm:ss
function parseCustomDate(dateStr) {
  if (!dateStr || dateStr === 'undefined' || dateStr === '-') return null;
  try {
    const parts = String(dateStr).trim().split(' ');
    const dateParts = parts[0].split('/');
    if (dateParts.length !== 3) return null;
    
    const timeParts = parts[1] ? parts[1].split(':') : [0, 0, 0];
    
    // Urutan: Year, MonthIndex (0-11), Day, Hour, Minute, Second
    return new Date(
      parseInt(dateParts[2]), 
      parseInt(dateParts[1]) - 1, 
      parseInt(dateParts[0]), 
      parseInt(timeParts[0] || 0), 
      parseInt(timeParts[1] || 0), 
      parseInt(timeParts[2] || 0)
    );
  } catch (e) { return null; }
}

/**
 * LOGIKA SLA (MENIT):
 * Skor = (1 - (Actual - Target) / Target) * 100
 */
function calculateNewSLAScore(row) {
  const tglStart = parseCustomDate(row['Tgl Terima']);
  // Jika belum closed, gunakan waktu sekarang untuk simulasi (Running SLA)
  // Namun dalam calculateMetrics nanti kita hanya filter yang sudah 'Closed'
  const tglEnd = parseCustomDate(row['Tgl Closed']) || new Date(); 
  
  if (!tglStart) return 0;

  const targetDays = parseNum(row['Target Hari']);
  const targetMinutes = targetDays * 1440; 
  
  if (targetMinutes <= 0) return 100;

  const diffMs = tglEnd.getTime() - tglStart.getTime();
  const actualMinutes = diffMs / 60000; 
  
  // Rumus Utama
  let score = (1 - (actualMinutes - targetMinutes) / targetMinutes) * 100;

  // Batasan (Clamping) agar nilai tidak merusak dashboard (Min -200, Max 200)
  if (score > 200) score = 200;
  if (score < -200) score = -200;

  return score;
}

function getScale(value, type) {
  if (type === 'closed') return value < 85 ? 1 : (value >= 100 ? 4 : 1 + ((value - 85) / 14.99) * 2.99);
  if (type === 'sla')    return value < 85 ? 1 : (value >= 130 ? 4 : 1 + ((value - 85) / 44.99) * 2.99);
  if (type === 'puas')   return value >= 4 ? 4 : (value <= 1 ? 1 : 1 + ((value - 1) / 3) * 2.99);
  return 1;
}

/**
 * HITUNG METRIK PER DEPARTEMEN
 * SLA dan Kepuasan hanya dihitung dari tiket yang sudah CLOSED
 */
function calculateMetrics(records) {
  const totalTicket = records.length;
  if (totalTicket === 0) return { total:0, closed:0, pct:"0.0", convC:"1.00", sla:"0.0", convS:"1.00", puas:"0.0", convK:"1.00", final:"0.00" };
  
  // 1. Filter tiket yang statusnya CLOSED
  const closedRecords = records.filter(r => {
    const status = String(r['Status'] || '').trim().toLowerCase();
    return status === 'closed' || status === 'selesai';
  });
  
  const closedCount = closedRecords.length;
  const pctClosed = (closedCount / totalTicket) * 100;
  
  // 2. Hitung SLA & Kepuasan (Hanya dari yang Closed)
  let avgSla = 0;
  let avgPuas = 0;

  if (closedCount > 0) {
    let sumSla = 0;
    let sumPuas = 0;
    let validSlaCount = 0;

    closedRecords.forEach(r => {
      const s = calculateNewSLAScore(r);
      // Hanya masukkan ke rata-rata jika tgl terima valid (skor tidak 0 kecuali memang telat parah)
      if (parseCustomDate(r['Tgl Terima']) !== null) {
        sumSla += s;
        validSlaCount++;
      }
      sumPuas += parseNum(r['Tingkat Kepuasan']);
    });

    avgSla = validSlaCount > 0 ? sumSla / validSlaCount : 0;
    avgPuas = sumPuas / closedCount;
  }
  
  const convC = getScale(pctClosed, 'closed');
  const convS = getScale(avgSla, 'sla');
  const convK = getScale(avgPuas, 'puas');
  
  // Bobot: Closed 30%, SLA 50%, Kepuasan 20%
  const finalScore = (convC * 0.3) + (convS * 0.5) + (convK * 0.2);
  
  return {
    total: totalTicket, 
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

function applyFilters() {
  const analysis = document.getElementById('f-analysis').value;
  const selectedMonth = parseInt(document.getElementById('f-month').value);
  const reportType = document.getElementById('f-report').value;
  const currentYear = new Date().getFullYear();

  filteredData = rawData.filter(row => {
    const tglTerima = parseCustomDate(row['Tgl Terima']);
    if (!tglTerima) return false;

    const rowMonth = tglTerima.getMonth();
    const rowYear = tglTerima.getFullYear();

    if (rowYear !== currentYear) return false;

    if (analysis === 'MTD') {
        if (rowMonth !== selectedMonth) return false;
    } 
    else if (analysis === 'YTD') {
        if (rowMonth > selectedMonth) return false;
    }

    if (reportType === 'score') {
        const targetDays = parseNum(row['Target Hari']);
        const tglTarget = new Date(tglTerima);
        tglTarget.setDate(tglTarget.getDate() + targetDays);
        if (tglTarget.getMonth() !== tglTerima.getMonth()) return false;
    }

    return true;
  });

  refreshDashboard();
}

function refreshDashboard() {
  const uniqueDepts = [...new Set(filteredData.map(d => String(d.Departemen || 'N/A').trim()))];
  rankedDepts = uniqueDepts.map(name => {
    const deptRecords = filteredData.filter(d => String(d.Departemen || 'N/A').trim() === name);
    return { name, ...calculateMetrics(deptRecords) };
  }).sort((a, b) => parseFloat(b.final) - parseFloat(a.final));

  const listEl = document.getElementById('dept-list');
  if (listEl) {
    listEl.innerHTML = rankedDepts.map((d, i) => `
      <div onclick="selectDept('${d.name.replace(/'/g, "\\'")}', this, ${i + 1})" 
           class="dept-item cursor-pointer p-3 rounded-xl hover:bg-slate-50 border-l-4 border-transparent transition-all group ${activeDeptName === d.name ? 'active-dept' : ''}">
        <div class="flex justify-between items-center mb-1">
          <span class="text-[8px] font-bold text-slate-400 uppercase">Rank #${i + 1}</span>
          <span class="text-[10px] font-black text-indigo-600">${d.final}</span>
        </div>
        <h3 class="text-[10px] font-bold text-slate-700 uppercase truncate">${d.name}</h3>
      </div>
    `).join('');
  }

  if (activeDeptName) {
      const found = rankedDepts.find(d => d.name === activeDeptName);
      if (found) {
        const idx = rankedDepts.findIndex(d => d.name === activeDeptName) + 1;
        updateDeptView(activeDeptName, idx);
      } else {
        showHome();
      }
  } else {
      showHome();
  }
}

function renderMetrikBox(containerId, m) {
  const container = document.getElementById(containerId);
  if(!container) return;
  const layout = [
    ["Total Ticket", m.total, "text-slate-600"],
    ["Closed", m.closed, "text-emerald-600"],
    ["% Closed", m.pct + "%", "text-emerald-600"],
    ["Konv (C)", m.convC, "text-emerald-400"],
    ["Avg SLA %", m.sla, "text-blue-600"],
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

function renderDetailTable(data, groupKey, tableId) {
  const tbody = document.getElementById(tableId);
  if (!tbody) return;
  const groups = {};
  data.forEach(row => {
    const key = String(row[groupKey] || 'N/A').trim();
    if (!groups[key]) groups[key] = [];
    groups[key].push(row);
  });
  
  const resultArr = Object.keys(groups).map(k => ({ name: k, ...calculateMetrics(groups[k]) }))
    .sort((a, b) => b.total - a.total).slice(0, 50);
  
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

function renderWarningTable(data, tableId) {
  const tbody = document.getElementById(tableId);
  if (!tbody) return;
  
  const unclosed = data.filter(d => {
    const status = String(d['Status'] || '').toLowerCase();
    return status !== 'closed' && status !== 'selesai';
  });

  const critical = unclosed.map(d => {
    const tgl = parseCustomDate(d['Tgl Terima']);
    const targetDays = parseNum(d['Target Hari']);
    const targetMin = targetDays * 1440;
    const umurMin = tgl ? Math.floor((new Date() - tgl) / 60000) : 0;
    
    let label = '', badge = '';
    if (targetMin > 0) {
        if (umurMin > targetMin) { label = 'OVER'; badge = 'bg-red-500'; }
        else if (umurMin >= targetMin - 1440) { label = 'WARN'; badge = 'bg-amber-400'; }
    }
    
    return { ...d, umurMin, targetMin, label, badge };
  }).filter(d => d.label !== '').sort((a,b) => (b.umurMin - b.targetMin) - (a.umurMin - a.targetMin)).slice(0, 50);

  if (critical.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-slate-400 italic">Semua aman</td></tr>`;
    return;
  }
  tbody.innerHTML = critical.map(d => `
    <tr class="text-[9px] hover:bg-red-50/30">
      <td class="p-3 font-bold text-slate-400">${d['Departemen'] || '-'}</td>
      <td class="p-3 font-mono font-bold text-indigo-600">${d['No Problem'] || '-'}</td>
      <td class="p-3 truncate max-w-[100px]">${d['Nama Penangung'] || '-'}</td>
      <td class="p-3 text-center font-bold text-slate-700">${d.umurMin} / ${d.targetMin} Min</td>
      <td class="p-3 text-center"><span class="${d.badge} text-white px-2 py-0.5 rounded-full font-black">${d.label}</span></td>
    </tr>
  `).join('');
}

function showHome() {
  activeDeptName = null;
  const viewHome = document.getElementById('view-home');
  const viewDept = document.getElementById('view-dept');
  if(viewHome) viewHome.classList.remove('hidden');
  if(viewDept) viewDept.classList.add('hidden');
  
  const btnHome = document.getElementById('btn-home');
  if(btnHome) btnHome.classList.add('nav-item-active');
  
  document.querySelectorAll('.dept-item').forEach(e => e.classList.remove('active-dept'));

  const m = calculateMetrics(filteredData);
  renderMetrikBox('home-metrics', m);
  renderDetailTable(filteredData, 'Nama Problem', 'home-body-prob');
  renderDetailTable(filteredData, 'Nama Penangung', 'home-body-pic');
  renderWarningTable(filteredData, 'home-body-warn');
}

function selectDept(deptName, el, rank) {
  activeDeptName = deptName;
  updateDeptView(deptName, rank);
}

function updateDeptView(deptName, rank) {
  const viewHome = document.getElementById('view-home');
  const viewDept = document.getElementById('view-dept');
  if(viewHome) viewHome.classList.add('hidden');
  if(viewDept) viewDept.classList.remove('hidden');
  
  const btnHome = document.getElementById('btn-home');
  if(btnHome) btnHome.classList.remove('nav-item-active');
  
  const deptData = filteredData.filter(d => String(d.Departemen || 'N/A').trim() === deptName);
  const m = calculateMetrics(deptData);
  
  const detName = document.getElementById('det-name');
  const detRank = document.getElementById('det-rank');
  const detScore = document.getElementById('det-score');
  
  if(detName) detName.innerText = deptName;
  if(detRank) detRank.innerText = `RANK #${rank}`;
  if(detScore) detScore.innerText = m.final;
  
  renderMetrikBox('dept-metrics', m);
  renderDetailTable(deptData, 'Nama Problem', 'dept-body-prob');
  renderDetailTable(deptData, 'Nama Penangung', 'dept-body-pic');
  
  // Script untuk mobile sidebar jika ada fungsi toggleSidebar
  if(window.innerWidth < 1024 && typeof toggleSidebar === 'function') toggleSidebar();
}

function doSearch(input, tableId) {
  const filter = input.value.toUpperCase();
  const rows = document.getElementById(tableId).getElementsByTagName("tr");
  for (let i = 0; i < rows.length; i++) {
    rows[i].style.display = rows[i].innerText.toUpperCase().includes(filter) ? "" : "none";
  }
}

async function init() {
  try {
    const res = await fetch(API_URL);
    const data = await res.json();
    // Filter out empty rows
    rawData = data.filter(r => r.Departemen && String(r.Departemen).trim() !== '');
    
    const fMonth = document.getElementById('f-month');
    if(fMonth) fMonth.value = new Date().getMonth();
    
    applyFilters();
  } catch (e) {
    const deptList = document.getElementById('dept-list');
    if(deptList) deptList.innerHTML = `<div class="p-4 text-red-500 text-[10px]">Koneksi Gagal: ${e.message}</div>`;
  }
}

document.addEventListener('DOMContentLoaded', init);
