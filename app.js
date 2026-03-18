const API_URL = "https://script.google.com/macros/s/AKfycbzGN9at-lP4l3UCA-xA4izCITNSMSvdgzorrVDd6GweLIHTLAWcLwOOZX0g2vClsqjr/exec"; 

let rawData = [];
let filteredData = [];
let rankedDepts = [];
let activeDeptName = null;

const getVal = (obj, possibleKeys) => {
  const keys = Object.keys(obj);
  if (!Array.isArray(possibleKeys)) possibleKeys = [possibleKeys];
  
  for (let pKey of possibleKeys) {
      const foundKey = keys.find(k => k.trim().toLowerCase() === pKey.toLowerCase());
      if (foundKey && obj[foundKey] !== undefined && obj[foundKey] !== '') {
          return obj[foundKey];
      }
  }
  return null;
};

const parseNum = (val) => {
  if (!val) return 0;
  const str = String(val).replace(',', '.').replace(/[^0-9.-]/g, '');
  return parseFloat(str) || 0;
};

function parseCustomDate(dateStr) {
  if (!dateStr || dateStr === 'undefined' || dateStr === '-') return null;
  
  let d = new Date(dateStr);
  if (!isNaN(d.getTime())) return d; 

  try {
    const sStr = String(dateStr).trim();
    const parts = sStr.split(' ');
    const dateParts = parts[0].split(/[-/]/); 
    
    if (dateParts.length !== 3) return null;
    const timeParts = parts[1] ? parts[1].split(':') : [0, 0, 0];
    
    let year, month, day;
    if (dateParts[0].length === 4) {
        year = dateParts[0]; month = dateParts[1]; day = dateParts[2];
    } else {
        day = dateParts[0]; month = dateParts[1]; year = dateParts[2];
    }
    
    return new Date(
        parseInt(year), 
        parseInt(month) - 1, 
        parseInt(day), 
        parseInt(timeParts[0] || 0), 
        parseInt(timeParts[1] || 0), 
        parseInt(timeParts[2] || 0)
    );
  } catch (e) { return null; }
}

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

function searchDept() {
  const input = document.getElementById('search-dept').value.toLowerCase();
  const items = document.querySelectorAll('.dept-item');
  items.forEach(item => {
      const deptName = item.querySelector('h3').innerText.toLowerCase();
      if (deptName.includes(input)) {
          item.style.display = '';
      } else {
          item.style.display = 'none';
      }
  });
}

function downloadTableAsCSV(tbodyId, filename) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  
  const rows = tbody.querySelectorAll('tr');
  let csvContent = "Dept,Kode Toko,Nama Toko,No Ticket,Masalah,PIC,Usia Tiket,Indikator,Status\n";
  
  rows.forEach(row => {
    if (row.style.display !== 'none') { 
      const cols = row.querySelectorAll('td');
      let rowData = [];
      cols.forEach(col => {
        let text = col.innerText.replace(/"/g, '""');
        rowData.push(`"${text}"`);
      });
      csvContent += rowData.join(",") + "\n";
    }
  });

  const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' }); 
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function getScale(value, type) {
  if (isNaN(value)) value = 0;

  if (type === 'closed') {
    if (value < 85) return 1.00;
    if (value >= 100) return 4.00;
    return 1.00 + ((value - 85) / 15.0) * 3.0; 
  }

  if (type === 'sla') {
    if (value < 85) return 1.00;
    if (value >= 130) return 4.00;
    return 1.00 + ((value - 85) / 45.0) * 3.0;
  }

  if (type === 'puas') {
    if (value <= 3.1) return 1.00;
    if (value >= 4.0) return 4.00;
    return 1.00 + ((value - 3.1) / 0.9) * 3.0;
  }
  
  return 1.00;
}

function calculateMetrics(records) {
  const total = records.length;
  if (total === 0) return { total:0, closed:0, pct:"0.0", convC:"1.00", sla:"0.0", convS:"1.00", puas:"0.0", convK:"1.00", final:"0.00" };

  const closedRecords = records.filter(r => {
      const status = String(getVal(r, ['Status']) || '').trim().toLowerCase();
      return ['closed'].includes(status);
  });
  
  const closed = closedRecords.length;
  const pctClosed = (closed / total) * 100;
  
  const totalSla = records.reduce((sum, r) => sum + parseNum(getVal(r, ['SLA'])), 0);
  const avgSla = totalSla / total;
  
  const totalPuas = records.reduce((sum, r) => sum + parseNum(getVal(r, ['TINGKAT KEPUASAN OLAHAN'])), 0);
  const avgPuas = totalPuas / total;
  
  const convC = getScale(pctClosed, 'closed');
  const convS = getScale(avgSla, 'sla');
  const convK = getScale(avgPuas, 'puas');
  
  const finalScore = (convC * 0.3) + (convS * 0.5) + (convK * 0.2);

  return {
    total, 
    closed, 
    pct: pctClosed.toFixed(1), 
    convC: convC.toFixed(2),
    sla: isNaN(avgSla) ? "0.0" : avgSla.toFixed(1), 
    convS: convS.toFixed(2), 
    puas: isNaN(avgPuas) ? "0.0" : avgPuas.toFixed(2), 
    convK: convK.toFixed(2),
    final: finalScore.toFixed(2)
  };
}

function applyFilters() {
  const analysis = document.getElementById('f-analysis').value;
  const selectedMonth = parseInt(document.getElementById('f-month').value);
  const reportType = document.getElementById('f-report').value;

  filteredData = rawData.filter(row => {
    let tglMulai = getVal(row, ['Tgl Eskalasi']);
    if (!tglMulai || String(tglMulai).trim() === '' || String(tglMulai) === '-') {
        tglMulai = getVal(row, ['Tgl Problem']);
    }
    
    const tglTerima = parseCustomDate(tglMulai);
    if (!tglTerima) return false;
    
    const rowMonth = tglTerima.getMonth();
    const targetDays = parseNum(getVal(row, ['Target Hari']));
    
    const tglTarget = new Date(tglTerima.getTime());
    tglTarget.setDate(tglTarget.getDate() + targetDays);
    const targetMonth = tglTarget.getMonth();

    if (analysis === 'YTD') {
        if (reportType === 'monitoring') {
            return rowMonth <= selectedMonth;
        } else if (reportType === 'score') {
            return rowMonth <= selectedMonth && targetMonth <= selectedMonth;
        }
    } else if (analysis === 'MTD') {
        if (reportType === 'monitoring') {
            return rowMonth === selectedMonth;
        } else if (reportType === 'score') {
            return rowMonth === selectedMonth && targetMonth <= selectedMonth;
        }
    }
    
    return true;
  });
  
  refreshDashboard();
}

function refreshDashboard() {
  const uniqueDepts = [...new Set(filteredData.map(d => String(getVal(d, ['Departement']) || 'N/A').trim()))];
  rankedDepts = uniqueDepts.map(name => {
    const deptRecords = filteredData.filter(d => String(getVal(d, ['Departement']) || 'N/A').trim() === name);
    return { name, ...calculateMetrics(deptRecords) };
  }).sort((a, b) => parseFloat(b.final) - parseFloat(a.final));

  const listEl = document.getElementById('dept-list');
  if (listEl) {
    listEl.innerHTML = rankedDepts.map((d, i) => `
      <div onclick="selectDept('${d.name.replace(/'/g, "\\'")}', this, ${i + 1})" 
           class="dept-item cursor-pointer p-3 mb-2 rounded-xl hover:bg-slate-100 border-l-4 border-transparent transition-all group ${activeDeptName === d.name ? 'active-dept shadow-sm bg-white' : ''}">
        <div class="flex justify-between items-center mb-1.5">
          <span class="text-[9px] font-black uppercase text-slate-500 bg-slate-200/60 px-2 py-0.5 rounded-md">Rank #${i + 1}</span>
          <span class="text-[11px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">${d.final}</span>
        </div>
        <h3 class="text-xs font-bold text-slate-700 uppercase truncate" title="${d.name}">${d.name}</h3>
      </div>
    `).join('');
  }
  activeDeptName ? updateDeptView(activeDeptName, rankedDepts.findIndex(d => d.name === activeDeptName) + 1) : showHome();
}

function renderMetrikBox(containerId, m) {
  const container = document.getElementById(containerId);
  if(!container) return;
  
  const layout = [
    ["Total Ticket", m.total, "text-slate-800"],
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
    <div class="${i === 8 ? 'bg-gradient-to-r from-indigo-600 to-indigo-500 shadow-md border-transparent' : 'bg-white border border-slate-200 shadow-sm'} p-4 rounded-2xl flex flex-col justify-between min-h-[90px]">
      <p class="text-[10px] font-bold ${i === 8 ? 'text-indigo-100' : 'text-slate-400'} uppercase tracking-wider mb-1">${item[0]}</p>
      <p class="text-2xl font-black italic tracking-tight ${item[2]}">${item[1]}</p>
    </div>
  `).join('');
}

function renderDetailTable(data, groupKeyObj, tableId, sortByScore = false) {
  const tbody = document.getElementById(tableId);
  if (!tbody) return;
  const groups = {};
  data.forEach(row => {
    const key = String(getVal(row, groupKeyObj) || 'N/A').trim();
    if (!groups[key]) groups[key] = [];
    groups[key].push(row);
  });
  let resultArr = Object.keys(groups).map(k => ({ name: k, ...calculateMetrics(groups[k]) }));
  if (sortByScore) resultArr.sort((a, b) => parseFloat(b.final) - parseFloat(a.final));
  else resultArr.sort((a, b) => b.total - a.total);
  
  tbody.innerHTML = resultArr.slice(0, 50).map(i => `
    <tr class="hover:bg-slate-50 transition-colors text-[10px]">
      <td class="p-3 font-semibold text-slate-700 truncate" title="${i.name}">${i.name}</td>
      <td class="p-3 text-center">${i.total}</td>
      <td class="p-3 text-center text-emerald-600 font-bold">${i.closed}</td>
      <td class="p-3 text-center">${i.pct}%</td>
      <td class="p-3 text-center text-blue-600">${i.sla}</td>
      <td class="p-3 text-center text-amber-600">${i.puas}</td>
      <td class="p-3 text-center font-black text-indigo-700">${i.final}</td>
    </tr>
  `).join('');
}

function renderWarningTable(baseData, tableId) {
  const tbody = document.getElementById(tableId);
  if (!tbody) return;
  
  const unclosed = baseData.filter(d => {
    const status = String(getVal(d, ['Status']) || '').trim().toLowerCase();
    return !['closed'].includes(status);
  });
  
  const critical = unclosed.map(d => {
    let tglRawStr = getVal(d, ['Tgl Eskalasi']);
    
    if (!tglRawStr || String(tglRawStr).trim() === '' || String(tglRawStr).trim() === '-') {
        tglRawStr = getVal(d, ['Tgl Problem']);
    }
    
    const tgl = parseCustomDate(tglRawStr);
    const targetDays = parseNum(getVal(d, ['Target Hari']));
    
    if (!tgl || targetDays <= 0) return null;
    
    const diffMs = new Date() - tgl.getTime();
    const usiaHari = diffMs / (1000 * 60 * 60 * 24);
    
    let label = 'SECURED', badge = 'bg-green-500';
    if (usiaHari > targetDays) { label = 'OVERDUE'; badge = 'bg-red-500'; }
    else if (usiaHari >= (targetDays * 0.7)) { label = 'WARNING'; badge = 'bg-amber-400'; } 
    
    if (label === 'SECURED') return null;

    return { 
      ...d, 
      usiaHari: usiaHari.toFixed(1), 
      targetDays, 
      label, 
      badge,
      sheetStatus: String(getVal(d, ['Status']) || '-').toUpperCase(),
      dept: getVal(d, ['Departement']) || '-',
      kodeToko: getVal(d, ['Kode Toko']) ||  '-',
      namaToko: getVal(d, ['Nama Toko']) || '-',
      masalah: getVal(d, ['Masalah']) || '-',
      noTicket: getVal(d, ['No Problem']) || '-',
      pic: getVal(d, ['Nama Penangung']) || '-'
    };
  }).filter(d => d !== null); 
  
  critical.sort((a,b) => parseFloat(b.usiaHari) - parseFloat(a.usiaHari));
  
  tbody.innerHTML = critical.map(d => `
    <tr class="text-[9px] hover:bg-slate-50 border-b border-slate-100">
      <td class="p-3 font-bold text-slate-500 truncate max-w-[80px]" title="${d.dept}">${d.dept}</td>
      <td class="p-3 font-bold text-slate-700">${d.kodeToko}</td>
      <td class="p-3 font-bold text-slate-700 truncate max-w-[100px]" title="${d.namaToko}">${d.namaToko}</td>
      <td class="p-3 font-mono font-bold text-indigo-600">${d.noTicket}</td>
      <td class="p-3 truncate max-w-[120px]" title="${d.masalah}">${d.masalah}</td>
      <td class="p-3 truncate font-semibold max-w-[80px]" title="${d.pic}">${d.pic}</td>
      <td class="p-3 text-center font-bold text-slate-600">${d.usiaHari} / ${d.targetDays} Hari</td>
      <td class="p-3 text-center font-bold text-slate-600 uppercase">${d.sheetStatus}</td>
      <td class="p-3 text-center"><span class="${d.badge} text-white px-2 py-1 rounded-md font-bold shadow-sm">${d.label}</span></td>
    </tr>
  `).join('');
}

function showHome() {
  activeDeptName = null;
  document.getElementById('view-home')?.classList.remove('hidden');
  document.getElementById('view-dept')?.classList.add('hidden');
  document.getElementById('btn-home')?.classList.add('nav-item-active');
  document.querySelectorAll('.dept-item').forEach(e => e.classList.remove('active-dept', 'bg-white'));
  
  const m = calculateMetrics(filteredData);
  renderMetrikBox('home-metrics', m);
  
  renderDetailTable(filteredData, ['Masalah'], 'home-body-prob', false);
  renderDetailTable(filteredData, ['Nama Penangung'], 'home-body-pic', true); 
  
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
  
  const deptDataFiltered = filteredData.filter(d => String(getVal(d, ['Departement']) || 'N/A').trim() === deptName);
  const m = calculateMetrics(deptDataFiltered);
  
  document.getElementById('det-name').innerText = deptName;
  document.getElementById('det-rank').innerText = `RANK #${rank}`;
  document.getElementById('det-score').innerText = m.final;
  
  renderMetrikBox('dept-metrics', m);
  renderDetailTable(deptDataFiltered, ['Masalah'], 'dept-body-prob', false);
  renderDetailTable(deptDataFiltered, ['Nama Penangung'], 'dept-body-pic', true); 
  
  const deptDataRaw = rawData.filter(d => String(getVal(d, ['Departement']) || 'N/A').trim() === deptName);
  renderWarningTable(deptDataRaw, 'dept-body-warn');

  document.querySelectorAll('.dept-item').forEach(e => {
    if (e.querySelector('h3').innerText === deptName) {
      e.classList.add('active-dept', 'bg-white');
    } else {
      e.classList.remove('active-dept', 'bg-white');
    }
  });
}

// PERBAIKAN: Inisiasi aplikasi dengan proteksi Cache dan Render Otomatis
async function initApp() {
  const listEl = document.getElementById('dept-list');
  const metricsEl = document.getElementById('home-metrics');
  const statusEl = document.getElementById('global-last-update');
  const syncIcon = document.getElementById('sync-icon');
  
  try {
    // 1. Eksekusi Teks Status: Sedang Mengambil Data (Warna Kuning)
    if (statusEl) {
        statusEl.innerText = "MENGAMBIL DATA...";
        statusEl.classList.remove('text-indigo-600', 'text-red-500', 'text-emerald-600');
        statusEl.classList.add('text-amber-500');
    }
    if (syncIcon) syncIcon.classList.add('animate-spin');
    
    // 2. Memanggil API Google Apps Script
    const response = await fetch(API_URL);
    if (!response.ok) throw new Error("Gagal terhubung ke server");
    
    const result = await response.json();
    
    // Validasi jika API me-return error internal
    if (result.status === "error") {
        throw new Error(result.message || "API Error");
    }
    
    // 3. Ekstrak data yang baru
    rawData = Array.isArray(result) ? result : (result.data || []);
    
    // 4. PROTEKSI CACHE: Update Cache Baru dibungkus try-catch
    try {
        localStorage.setItem("aho_raw_data", JSON.stringify(rawData));
    } catch (storageErr) {
        console.warn("Storage penuh, data terlalu besar untuk cache lokal, tapi sistem tetap berjalan normal:", storageErr);
    }

    // Validasi apabila database di sheet benar-benar kosong
    if (!rawData || rawData.length === 0) {
      if (listEl) listEl.innerHTML = `<p class="p-4 text-center text-red-500 font-bold">Data Kosong</p>`;
      if (statusEl) {
          statusEl.innerText = "DATA KOSONG";
          statusEl.classList.remove('text-amber-500');
          statusEl.classList.add('text-red-500');
      }
      return;
    }

    // 5. PAKSA RENDER KE LAYAR SEKARANG JUGA
    applyFilters(); 
    
    // 6. Update Status Berhasil setelah data dirender (Warna Hijau)
    if (statusEl) {
      statusEl.innerText = `SYNCED: ${new Date().toLocaleTimeString('id-ID')}`;
      statusEl.classList.remove('text-amber-500', 'text-red-500', 'text-indigo-600');
      statusEl.classList.add('text-emerald-600');
    }

  } catch (error) {
    console.error("Error initApp:", error);
    
    // Berikan feedback kalau gagal tarik data baru (Warna Merah)
    if (statusEl) {
        statusEl.innerText = "GAGAL SYNC (PAKAI CACHE)";
        statusEl.classList.remove('text-amber-500', 'text-emerald-600', 'text-indigo-600');
        statusEl.classList.add('text-red-500');
    }
    
    // Tetap coba render apa pun data yang terselamatkan (misal dari cache lama)
    if(rawData && rawData.length > 0) {
        applyFilters();
    } else {
        if (listEl) listEl.innerHTML = `<p class="p-4 text-center text-red-500 font-bold">Error Koneksi API</p>`;
        if (metricsEl) metricsEl.innerHTML = `<div class="col-span-full p-10 text-center bg-white rounded-2xl shadow-sm border border-red-100">
          <p class="text-red-500 font-bold uppercase">Gagal Memuat Dashboard</p>
          <p class="text-slate-400 text-[10px] mt-2">Pastikan internet stabil & API Script merespons.</p>
        </div>`;
    }
  } finally {
    // Matikan animasi icon putar apa pun yang terjadi
    if (syncIcon) syncIcon.classList.remove('animate-spin');
  }
}
