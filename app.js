const API_URL = "https://script.google.com/macros/s/AKfycbxMeXvqBc5aW_0P89u5mf1uRQKyIe2lcLIJks75qpVQoFdd4ismc4Ri7gTlT4m4MB7E/exec"; 

let rawData = [];
let filteredData = [];
let rankedDepts = [];
let activeDeptName = null;

const getVal = (obj, keyName) => {
  const keys = Object.keys(obj);
  const foundKey = keys.find(k => k.trim().toLowerCase() === keyName.toLowerCase());
  return foundKey ? obj[foundKey] : null;
};

const parseNum = (val) => {
  if (!val) return 0;
  const str = String(val).replace(',', '.').replace(/[^0-9.-]/g, '');
  return parseFloat(str) || 0;
};

function parseCustomDate(dateStr) {
  if (!dateStr || dateStr === 'undefined' || dateStr === '-') return null;
  try {
    const sStr = String(dateStr).trim();
    const parts = sStr.split(' ');
    const dateParts = parts[0].split('/');
    if (dateParts.length !== 3) return null;
    const timeParts = parts[1] ? parts[1].split(':') : [0, 0, 0];
    return new Date(parseInt(dateParts[2]), parseInt(dateParts[1]) - 1, parseInt(dateParts[0]), parseInt(timeParts[0] || 0), parseInt(timeParts[1] || 0), parseInt(timeParts[2] || 0));
  } catch (e) { return null; }
}

// Fitur Pencarian / Filter Tabel
function doSearch(inputEl, tableBodyId) {
  const term = inputEl.value.toLowerCase();
  const tbody = document.getElementById(tableBodyId);
  if (!tbody) return;
  const rows = tbody.getElementsByTagName("tr");
  for (let i = 0; i < rows.length; i++) {
    const textData = rows[i].textContent || rows[i].innerText;
    rows[i].style.display = textData.toLowerCase().indexOf(term) > -1 ? "" : "none";
  }
}

// LOGIKA SLA TERBARU & TELITI
function calculateNewSLAScore(row) {
  const tglStart = parseCustomDate(getVal(row, 'Tgl Terima'));
  const tglEnd = parseCustomDate(getVal(row, 'Tgl Closed')) || new Date(); 
  const targetDays = parseNum(getVal(row, 'Target Hari'));

  if (!tglStart) return 0;
  if (targetDays <= 0) return 100;

  const targetMins = targetDays * 1440;
  const actualMins = (tglEnd.getTime() - tglStart.getTime()) / (1000 * 60);
  const ratio = actualMins / targetMins;

  if (actualMins <= 1440) return 200;
  if (ratio <= 0.25) return 175;
  if (ratio <= 0.50) return 150;
  if (Math.abs(actualMins - targetMins) < 60) return 100;
  if (ratio >= 4) return -200;
  if (ratio >= 3) return -100;
  if (ratio >= 2) return 0;

  return Math.round(100 - ((ratio - 1) * 100));
}

function getScale(value, type) {
  if (type === 'closed') return value < 85 ? 1 : (value >= 100 ? 4 : 1 + ((value - 85) / 14.99) * 2.99);
  if (type === 'sla') {
    let scaled = 1 + ((value + 200) / 400) * 3;
    return Math.max(1, Math.min(4, scaled));
  }
  if (type === 'puas') return value >= 4 ? 4 : (value <= 1 ? 1 : 1 + ((value - 1) / 3) * 2.99);
  return 1;
}

function calculateMetrics(records) {
  const closedRecords = records.filter(r => ['closed', 'selesai'].includes(String(getVal(r, 'Status') || '').trim().toLowerCase()));
  const total = records.length;
  const closed = closedRecords.length;
  if (total === 0) return { total:0, closed:0, pct:"0.0", convC:"1.00", sla:"0.0", convS:"1.00", puas:"0.0", convK:"1.00", final:"0.00" };
  
  let avgSla = 0, avgPuas = 0;
  if (closed > 0) {
    avgSla = closedRecords.reduce((sum, r) => sum + calculateNewSLAScore(r), 0) / closed;
    avgPuas = closedRecords.reduce((sum, r) => sum + parseNum(getVal(r, 'Tingkat Kepuasan')), 0) / closed;
  }
  
  const convC = getScale((closed / total) * 100, 'closed');
  const convS = getScale(avgSla, 'sla');
  const convK = getScale(avgPuas, 'puas');
  
  return {
    total, closed, pct: ((closed / total) * 100).toFixed(1), convC: convC.toFixed(2),
    sla: avgSla.toFixed(1), convS: convS.toFixed(2), puas: avgPuas.toFixed(1), convK: convK.toFixed(2),
    final: ((convC * 0.3) + (convS * 0.5) + (convK * 0.2)).toFixed(2)
  };
}

function applyFilters() {
  const analysis = document.getElementById('f-analysis').value;
  const selectedMonth = parseInt(document.getElementById('f-month').value);
  const reportType = document.getElementById('f-report').value;

  filteredData = rawData.filter(row => {
    const tglTerima = parseCustomDate(getVal(row, 'Tgl Terima'));
    if (!tglTerima) return false;
    const rowMonth = tglTerima.getMonth();
    const targetDays = parseNum(getVal(row, 'Target Hari'));
    const tglTarget = new Date(tglTerima.getTime());
    tglTarget.setDate(tglTarget.getDate() + targetDays);
    const targetMonth = tglTarget.getMonth();

    if (analysis === 'MTD') return (reportType === 'monitoring' ? rowMonth : targetMonth) === selectedMonth;
    else if (analysis === 'YTD') return (reportType === 'monitoring' ? rowMonth : targetMonth) <= selectedMonth;
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
    <div class="${i === 8 ? 'bg-gradient-to-r from-indigo-600 to-indigo-500 shadow-lg' : 'bg-white border'} p-4 rounded-xl flex flex-col justify-center">
      <p class="text-[8px] font-bold ${i === 8 ? 'text-indigo-100' : 'text-slate-400'} uppercase mb-1">${item[0]}</p>
      <p class="text-xl font-black italic ${item[2]}">${item[1]}</p>
    </div>
  `).join('');
}

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
  if (sortByScore) resultArr.sort((a, b) => parseFloat(b.final) - parseFloat(a.final));
  else resultArr.sort((a, b) => b.total - a.total);
  
  tbody.innerHTML = resultArr.slice(0, 50).map(i => `
    <tr class="hover:bg-slate-50 transition-colors text-[10px]">
      <td class="p-3 font-semibold text-slate-700 truncate max-w-[120px] sm:max-w-[200px]" title="${i.name}">${i.name}</td>
      <td class="p-3 text-center">${i.total}</td>
      <td class="p-3 text-center text-emerald-600">${i.closed}</td>
      <td class="p-3 text-center">${i.pct}%</td>
      <td class="p-3 text-center text-blue-600">${i.sla}</td>
      <td class="p-3 text-center text-amber-600">${i.puas}</td>
      <td class="p-3 text-center font-black text-indigo-700">${i.final}</td>
    </tr>
  `).join('');
}

// Logika Baru Warning Table (Menambahkan fallback Kode Toko dan Nama Toko yang akurat)
function renderWarningTable(baseData, tableId) {
  const tbody = document.getElementById(tableId);
  if (!tbody) return;
  
  // Ambil tiket yang statusnya BUKAN closed/selesai
  const unclosed = baseData.filter(d => {
    const status = String(getVal(d, 'Status') || '').trim().toLowerCase();
    return status !== 'closed' && status !== 'selesai';
  });
  
  const critical = unclosed.map(d => {
    const tgl = parseCustomDate(getVal(d, 'Tgl Terima'));
    const targetDays = parseNum(getVal(d, 'Target Hari'));
    if (!tgl || targetDays <= 0) return null;
    
    const diffMs = new Date() - tgl.getTime();
    const usiaHari = diffMs / (1000 * 60 * 60 * 24);
    
    let label = 'ON TRACK', badge = 'bg-green-500';
    // Warning jika usia mencapai 70% dari target hari
    if (usiaHari > targetDays) { label = 'OVERDUE'; badge = 'bg-red-500'; }
    else if (usiaHari >= (targetDays * 0.7)) { label = 'WARNING'; badge = 'bg-amber-400'; } 
    
    // Hanya render jika melebihi SLA atau Warning, abaikan yang ON TRACK
   

    return { 
      ...d, 
      usiaHari: usiaHari.toFixed(1), 
      targetDays, 
      label, 
      badge,
      // Menggunakan banyak alternatif fallback agar pasti terbaca dari Google Sheets
      kodeToko: getVal(d, 'Kode Toko') ||  '-',
      namaToko: getVal(d, 'Nama Toko') || '-',
      masalah: getVal(d, 'Masalah') || '-',
      noTicket: getVal(d, 'No Problem') || '-',
      pic: getVal(d, 'Nama Penangung') || '-'
    };
  }).filter(d => d !== null); // Hapus hasil null
  
  critical.sort((a,b) => parseFloat(b.usiaHari) - parseFloat(a.usiaHari));
  
  // Render sesuai urutan: Dept, Kode toko, Nama toko, No ticket, Masalah, PIC, Usia/target, Status
  tbody.innerHTML = critical.map(d => `
    <tr class="text-[9px] hover:bg-slate-50 border-b border-slate-100">
      <td class="p-3 font-bold text-slate-500">${getVal(d, 'Departemen') || '-'}</td>
      <td class="p-3 font-bold text-slate-700">${d.kodeToko}</td>
      <td class="p-3 font-bold text-slate-700 truncate max-w-[100px]" title="${d.namaToko}">${d.namaToko}</td>
      <td class="p-3 font-mono font-bold text-indigo-600">${d.noTicket}</td>
      <td class="p-3 max-w-[150px] truncate" title="${d.masalah}">${d.masalah}</td>
      <td class="p-3 truncate" title="${d.pic}">${d.pic}</td>
      <td class="p-3 text-center font-medium">${d.usiaHari} / ${d.targetDays} Hari</td>
      <td class="p-3 text-center"><span class="${d.badge} text-white px-2 py-1 rounded-md font-bold shadow-sm">${d.label}</span></td>
    </tr>
  `).join('');
}

function showHome() {
  activeDeptName = null;
  document.getElementById('view-home')?.classList.remove('hidden');
  document.getElementById('view-dept')?.classList.add('hidden');
  document.getElementById('btn-home')?.classList.add('nav-item-active');
  document.querySelectorAll('.dept-item').forEach(e => e.classList.remove('active-dept'));
  
  const m = calculateMetrics(filteredData);
  renderMetrikBox('home-metrics', m);
  renderDetailTable(filteredData, 'Nama Problem', 'home-body-prob', false);
  renderDetailTable(filteredData, 'Nama Penangung', 'home-body-pic', true); 
  
  renderWarningTable(rawData, 'home-body-warn');
}

function selectDept(deptName, el, rank) {
  activeDeptName = deptName;
  updateDeptView(deptName, rank);
}

function updateDeptView(deptName, rank) {
  document.getElementById('view-home')?.classList.add('hidden');
  document.getElementById('view-dept')?.classList.remove('hidden');
  document.getElementById('btn-home')?.classList.remove('nav-item-active');
  
  const deptDataFiltered = filteredData.filter(d => String(getVal(d, 'Departemen') || 'N/A').trim() === deptName);
  const m = calculateMetrics(deptDataFiltered);
  
  document.getElementById('det-name').innerText = deptName;
  document.getElementById('det-rank').innerText = `RANK #${rank}`;
  document.getElementById('det-score').innerText = m.final;
  
  renderMetrikBox('dept-metrics', m);
  renderDetailTable(deptDataFiltered, 'Nama Problem', 'dept-body-prob', false);
  renderDetailTable(deptDataFiltered, 'Nama Penangung', 'dept-body-pic', true); 
  
  const deptDataRaw = rawData.filter(d => String(getVal(d, 'Departemen') || 'N/A').trim() === deptName);
  
  // Memanggil table warning untuk departemen terpilih
  renderWarningTable(deptDataRaw, 'dept-body-warn');

  document.querySelectorAll('.dept-item').forEach(e => {
    if (e.querySelector('h3').innerText === deptName) {
      e.classList.add('active-dept');
    } else {
      e.classList.remove('active-dept');
    }
  });
}

// FUNGSI UTAMA: AMBIL DATA DARI API
async function initApp() {
  const listEl = document.getElementById('dept-list');
  const metricsEl = document.getElementById('home-metrics');
  
  try {
    const response = await fetch(API_URL);
    if (!response.ok) throw new Error("Gagal mengambil data");
    
    const result = await response.json();
    rawData = Array.isArray(result) ? result : result.data;

    if (!rawData || rawData.length === 0) {
      listEl.innerHTML = `<p class="p-4 text-center text-red-500 font-bold">Data Kosong</p>`;
      return;
    }

    const now = new Date();
    document.getElementById('f-month').value = now.getMonth();
    
    const statusEl = document.getElementById('global-last-update');
    if (statusEl) {
      statusEl.innerText = `Synced: ${now.toLocaleTimeString('id-ID')}`;
    }

    applyFilters(); 

  } catch (error) {
    console.error("Error:", error);
    listEl.innerHTML = `<p class="p-4 text-center text-red-500 font-bold">Error Koneksi API</p>`;
    metricsEl.innerHTML = `<div class="col-span-full p-10 text-center bg-white rounded-2xl shadow-sm border border-red-100">
      <p class="text-red-500 font-bold uppercase">Gagal Memuat Dashboard</p>
      <p class="text-slate-400 text-[10px] mt-2">Pastikan URL API Apps Script benar dan izin akses diatur ke 'Anyone'</p>
    </div>`;
  }
}

document.addEventListener('DOMContentLoaded', initApp);
