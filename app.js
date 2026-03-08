const API_URL = "https://script.google.com/macros/s/AKfycbxMeXvqBc5aW_0P89u5mf1uRQKyIe2lcLIJks75qpVQoFdd4ismc4Ri7gTlT4m4MB7E/exec"; 

let rawData = [];
let filteredData = [];
let rankedDepts = [];
let activeDeptName = null;

// Helper Pencarian Key Properti (Case Insensitive & Trim)
const getVal = (obj, keyName) => {
  const keys = Object.keys(obj);
  const foundKey = keys.find(k => k.trim().toLowerCase() === keyName.toLowerCase());
  return foundKey ? obj[foundKey] : null;
};

// Helper Parsing Angka
const parseNum = (val) => {
  if (!val) return 0;
  const str = String(val).replace(',', '.').replace(/[^0-9.-]/g, '');
  return parseFloat(str) || 0;
};

// Helper Parsing Tanggal format DD/MM/YYYY HH:mm:ss
function parseCustomDate(dateStr) {
  if (!dateStr || dateStr === 'undefined' || dateStr === '-') return null;
  try {
    const sStr = String(dateStr).trim();
    const parts = sStr.split(' ');
    const dateParts = parts[0].split('/');
    if (dateParts.length !== 3) return null;
    
    const timeParts = parts[1] ? parts[1].split(':') : [0, 0, 0];
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
 * LOGIKA SLA (Diperbarui)
 * Menggunakan rasio presisi: (Target / Aktual) * 100
 */
function calculateNewSLAScore(row) {
  const tglStart = parseCustomDate(getVal(row, 'Tgl Terima'));
  const tglEnd = parseCustomDate(getVal(row, 'Tgl Closed')) || new Date(); 
  const targetDays = parseNum(getVal(row, 'Target Hari'));

  if (!tglStart) return 0;
  if (targetDays <= 0) return 100; // Jika tidak ada target, berikan nilai sempurna

  // Hitung selisih waktu
  const diffMs = tglEnd.getTime() - tglStart.getTime();
  let actualDays = diffMs / (1000 * 60 * 60 * 24); 

  // Jika selesai di hari yang sama/kurang dari 1 jam, set batas minimal agar pembagi tidak 0 atau minus
  if (actualDays <= 0) actualDays = 0.1;

  // Hitung persentase ketercapaian SLA
  let score = (targetDays / actualDays) * 100;

  // Batasi batas atas agar nilai terlalu cepat tidak merusak rata-rata secara ekstrem
  if (score > 200) score = 200;

  return score;
}

function getScale(value, type) {
  if (type === 'closed') return value < 85 ? 1 : (value >= 100 ? 4 : 1 + ((value - 85) / 14.99) * 2.99);
  if (type === 'sla')    return value < 85 ? 1 : (value >= 130 ? 4 : 1 + ((value - 85) / 44.99) * 2.99);
  if (type === 'puas')   return value >= 4 ? 4 : (value <= 1 ? 1 : 1 + ((value - 1) / 3) * 2.99);
  return 1;
}

/**
 * HITUNG METRIK
 */
function calculateMetrics(records) {
  const totalTicket = records.length;
  if (totalTicket === 0) return { total:0, closed:0, pct:"0.0", convC:"1.00", sla:"0.0", convS:"1.00", puas:"0.0", convK:"1.00", final:"0.00" };
  
  const closedRecords = records.filter(r => {
    const status = String(getVal(r, 'Status') || '').trim().toLowerCase();
    return status === 'closed' || status === 'selesai';
  });
  
  const closedCount = closedRecords.length;
  const pctClosed = (closedCount / totalTicket) * 100;
  
  let avgSla = 0;
  let avgPuas = 0;

  if (closedCount > 0) {
    let sumSla = 0;
    let sumPuas = 0;
    let validSlaCount = 0;

    closedRecords.forEach(r => {
      const s = calculateNewSLAScore(r);
      if (parseCustomDate(getVal(r, 'Tgl Terima')) !== null) {
        sumSla += s;
        validSlaCount++;
      }
      sumPuas += parseNum(getVal(r, 'Tingkat Kepuasan'));
    });

    avgSla = validSlaCount > 0 ? sumSla / validSlaCount : 0;
    avgPuas = sumPuas / closedCount;
  }
  
  const convC = getScale(pctClosed, 'closed');
  const convS = getScale(avgSla, 'sla');
  const convK = getScale(avgPuas, 'puas');
  
  const finalScore = (convC * 0.3) + (convS * 0.5) + (convK * 0.2);
  
  return {
    total: totalTicket, closed: closedCount, pct: pctClosed.toFixed(1), convC: convC.toFixed(2),
    sla: avgSla.toFixed(1), convS: convS.toFixed(2), puas: avgPuas.toFixed(1), convK: convK.toFixed(2),
    final: finalScore.toFixed(2)
  };
}

/**
 * FILTERING DATA 
 */
function applyFilters() {
  const analysis = document.getElementById('f-analysis').value;
  const selectedMonth = parseInt(document.getElementById('f-month').value);
  const reportType = document.getElementById('f-report').value;
  const currentYear = new Date().getFullYear();

  filteredData = rawData.filter(row => {
    const tglTerima = parseCustomDate(getVal(row, 'Tgl Terima'));
    if (!tglTerima) return false;

    const rowYear = tglTerima.getFullYear();
    if (rowYear !== currentYear) return false;

    const rowMonth = tglTerima.getMonth();
    
    // Perhitungan Bulan Target Jatuh Tempo
    const targetDays = parseNum(getVal(row, 'Target Hari'));
    const tglTarget = new Date(tglTerima.getTime());
    tglTarget.setDate(tglTarget.getDate() + targetDays);
    const targetMonth = tglTarget.getMonth();

    if (analysis === 'MTD') {
        if (reportType === 'monitoring') {
            return rowMonth === selectedMonth; 
        } else if (reportType === 'score') {
            return targetMonth === selectedMonth; 
        }
    } else if (analysis === 'YTD') {
        if (reportType === 'monitoring') {
            return rowMonth <= selectedMonth; 
        } else if (reportType === 'score') {
            return targetMonth <= selectedMonth; 
        }
    }
    return true;
  });

  refreshDashboard();
}

function refreshDashboard() {
  const uniqueDepts = [...new Set(filteredData.map(d => String(getVal(d, 'Departemen') || 'N/A').trim()))];
  rankedDepts = uniqueDepts.map(name => {
    const deptRecords = filteredData.filter(d => String(getVal(d, 'Departemen') || 'N/A').trim() === name);
    return { name, ...calculateMetrics(deptRecords) };
  }).sort((a, b) => parseFloat(b.final) - parseFloat(a.final));

  const listEl = document.getElementById('dept-list');
  if (listEl) {
    listEl.innerHTML = rankedDepts.map((d, i) => `
      <div onclick="selectDept('${d.name.replace(/'/g, "\\'")}', this, ${i + 1})" 
           class="dept-item cursor-pointer p-3 rounded-xl hover:bg-slate-100 border-l-4 border-transparent transition-all group ${activeDeptName === d.name ? 'active-dept shadow-sm' : ''}">
        <div class="flex justify-between items-center mb-1">
          <span class="text-[8px] font-bold text-slate-400 uppercase">Rank #${i + 1}</span>
          <span class="text-[10px] font-black text-indigo-600">${d.final}</span>
        </div>
        <h3 class="text-[10px] font-bold text-slate-700 uppercase truncate">${d.name}</h3>
      </div>
    `).join('');
  }
  activeDeptName ? updateDeptView(activeDeptName, rankedDepts.findIndex(d => d.name === activeDeptName) + 1) : showHome();
}

function renderMetrikBox(containerId, m) {
  const container = document.getElementById(containerId);
  if(!container) return;
  const layout = [
    ["Total Ticket", m.total, "text-slate-700"],
    ["Closed", m.closed, "text-emerald-600"],
    ["% Closed", m.pct + "%", "text-emerald-600"],
    ["Konv (C)", m.convC, "text-emerald-500"],
    ["Avg SLA %", m.sla, "text-blue-600"],
    ["Konv (S)", m.convS, "text-blue-500"],
    ["Avg Puas", m.puas, "text-amber-600"],
    ["Konv (K)", m.convK, "text-amber-500"],
    ["Score Layanan", m.final, "text-white"]
  ];
  container.innerHTML = layout.map((item, i) => `
    <div class="${i === 8 ? 'bg-gradient-to-r from-indigo-600 to-indigo-500 shadow-lg border-transparent' : 'bg-white border border-slate-200'} p-4 rounded-xl flex flex-col justify-center">
      <p class="text-[8px] font-bold ${i === 8 ? 'text-indigo-100' : 'text-slate-400'} uppercase mb-1">${item[0]}</p>
      <p class="text-xl font-black italic ${item[2]}">${item[1]}</p>
    </div>
  `).join('');
}

/**
 * RENDER TABEL
 */
function renderDetailTable(data, groupKey, tableId, sortByScore = false) {
  const tbody = document.getElementById(tableId);
  if (!tbody) return;
  const groups = {};
  data.forEach(row => {
    const key = String(getVal(row, groupKey) || 'N/A').trim();
    if (!groups[key]) groups[key] = [];
    groups[key].push(row);
  });
  
  let resultArr = Object.keys(groups).map(k => ({ name: k, ...calculateMetrics(groups[k]) }));
  
  if (sortByScore) {
      resultArr.sort((a, b) => parseFloat(b.final) - parseFloat(a.final));
  } else {
      resultArr.sort((a, b) => b.total - a.total);
  }
  
  resultArr = resultArr.slice(0, 50);

  tbody.innerHTML = resultArr.map(i => `
    <tr class="hover:bg-slate-50 transition-colors">
      <td class="p-3 font-semibold text-slate-700 truncate max-w-[150px]" title="${i.name}">${i.name}</td>
      <td class="p-3 text-center font-medium">${i.total}</td>
      <td class="p-3 text-center text-emerald-600 font-medium">${i.closed}</td>
      <td class="p-3 text-center text-slate-500">${i.pct}%</td>
      <td class="p-3 text-center text-blue-600 font-medium">${i.sla}</td>
      <td class="p-3 text-center text-amber-600 font-medium">${i.puas}</td>
      <td class="p-3 text-center font-black text-indigo-700 bg-indigo-50/50">${i.final}</td>
    </tr>
  `).join('');
}

/**
 * RENDER TABEL WARNING (Diperbarui Logika Mendekati SLA)
 */
function renderWarningTable(data, tableId) {
  const tbody = document.getElementById(tableId);
  if (!tbody) return;
  
  const unclosed = data.filter(d => {
    const status = String(getVal(d, 'Status') || '').trim().toLowerCase();
    return status !== 'closed' && status !== 'selesai';
  });

  const critical = unclosed.map(d => {
    const tgl = parseCustomDate(getVal(d, 'Tgl Terima'));
    const targetDays = parseNum(getVal(d, 'Target Hari'));
    
    if (!tgl || targetDays <= 0) return null;

    const diffMs = new Date() - tgl.getTime();
    const usiaHari = diffMs / (1000 * 60 * 60 * 24);
    
    let label = '', badge = '';
    const sisaHari = targetDays - usiaHari;
    
    // OVERDUE: Waktu habis
    if (usiaHari > targetDays) { 
        label = 'OVERDUE'; 
        badge = 'bg-red-500 shadow-sm shadow-red-500/30'; 
    }
    // WARNING: Jika waktu terpakai sdh 70% ATAU sisa waktu tinggal 1.5 hari
    else if (usiaHari >= (targetDays * 0.7) || sisaHari <= 1.5) { 
        label = 'WARNING'; 
        badge = 'bg-amber-400 shadow-sm shadow-amber-400/30'; 
    } 
    // Sisanya ON TRACK (tapi kita sembunyikan agar fokus ke warning)
    else {
        label = 'ON TRACK';
    }
    
    return { ...d, usiaHari: usiaHari.toFixed(1), targetDays, label, badge };
  }).filter(d => d !== null && d.label !== 'ON TRACK'); // Hapus null & On Track

  // Urutkan dari usia hari yang paling tua
  critical.sort((a,b) => parseFloat(b.usiaHari) - parseFloat(a.usiaHari));
  
  const sliced = critical.slice(0, 50);

  if (sliced.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-slate-400 font-medium italic bg-slate-50/30">Semua problem terpantau aman terkendali.</td></tr>`;
    return;
  }
  
  tbody.innerHTML = sliced.map(d => `
    <tr class="text-[9px] hover:bg-slate-50 transition-colors">
      <td class="p-4 font-bold text-slate-500">${getVal(d, 'Departemen') || '-'}</td>
      <td class="p-4 font-mono font-bold text-indigo-600">${getVal(d, 'No Problem') || '-'}</td>
      <td class="p-4 truncate max-w-[150px] font-medium text-slate-700">${getVal(d, 'Nama Penangung') || '-'}</td>
      <td class="p-4 text-center font-bold text-slate-700">${d.usiaHari} <span class="text-slate-300 mx-1">/</span> ${d.targetDays} Hari</td>
      <td class="p-4 text-center"><span class="${d.badge} text-white px-2.5 py-1 rounded-full font-black tracking-wide">${d.label}</span></td>
    </tr>
  `).join('');
}

function showHome() {
  activeDeptName = null;
  const vH = document.getElementById('view-home'), vD = document.getElementById('view-dept');
  if(vH) vH.classList.remove('hidden'); if(vD) vD.classList.add('hidden');
  document.getElementById('btn-home')?.classList.add('nav-item-active');
  document.querySelectorAll('.dept-item').forEach(e => e.classList.remove('active-dept'));

  const m = calculateMetrics(filteredData);
  renderMetrikBox('home-metrics', m);
  
  renderDetailTable(filteredData, 'Nama Problem', 'home-body-prob', false);
  renderDetailTable(filteredData, 'Nama Penangung', 'home-body-pic', true); 
  
  renderWarningTable(filteredData, 'home-body-warn');
}

function selectDept(deptName, el, rank) {
  activeDeptName = deptName;
  updateDeptView(deptName, rank);
}

function updateDeptView(deptName, rank) {
  const vH = document.getElementById('view-home'), vD = document.getElementById('view-dept');
  if(vH) vH.classList.add('hidden'); if(vD) vD.classList.remove('hidden');
  document.getElementById('btn-home')?.classList.remove('nav-item-active');
  
  const deptData = filteredData.filter(d => String(getVal(d, 'Departemen') || 'N/A').trim() === deptName);
  const m = calculateMetrics(deptData);
  
  document.getElementById('det-name').innerText = deptName;
  document.getElementById('det-rank').innerText = `RANK #${rank}`;
  document.getElementById('det-score').innerText = m.final;
  
  renderMetrikBox('dept-metrics', m);
  
  renderDetailTable(deptData, 'Nama Problem', 'dept-body-prob', false);
  renderDetailTable(deptData, 'Nama Penangung', 'dept-body-pic', true); 
  
  // Render Tabel Warning Khusus Dept
  renderWarningTable(deptData, 'dept-body-warn');

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
    rawData = data.filter(r => getVal(r, 'Departemen') && String(getVal(r, 'Departemen')).trim() !== '');
    const fM = document.getElementById('f-month');
    if(fM) fM.value = new Date().getMonth(); 
    applyFilters();
  } catch (e) {
    const dL = document.getElementById('dept-list');
    if(dL) dL.innerHTML = `<div class="p-4 text-red-500 font-medium text-xs bg-red-50 rounded-lg border border-red-100 mx-4">Koneksi Gagal: Silakan refresh halaman atau cek script google anda.</div>`;
  }
}

document.addEventListener('DOMContentLoaded', init);
