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

  if (dateStr instanceof Date) {
      if (!isNaN(dateStr.getTime())) return dateStr;
  }

  try {
    const sStr = String(dateStr).trim();
    const parts = sStr.split(/[ T]/);
    const dateParts = parts[0].split(/[-/]/);

    if (dateParts.length === 3) {
        const timeParts = parts[1] ? parts[1].split(/[:.]/) : [0, 0, 0];
        
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
    }

    let d = new Date(dateStr);
    if (!isNaN(d.getTime())) return d;

    return null;
  } catch (e) { return null; }
}

function formatUIDate(d) {
  if (!d) return "-";
  const pad = (n) => n.toString().padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}.${pad(d.getMinutes())}.${pad(d.getSeconds())}`;
}

function calculateDurationMs(start, end) {
  if (!start || !end) return null;
  let diff = end.getTime() - start.getTime();
  return diff >= 0 ? diff : null;
}

// Convert MS to decimal D format (e.g. 4.2 D)
function msToDecimalDays(ms) {
  if (ms === null || isNaN(ms)) return "-";
  const days = ms / (1000 * 60 * 60 * 24);
  return `${days.toFixed(1)} D`;
}

function calculateDurationDecimal(start, end) {
  if (!start || !end) return "-";
  
  let diffMs = end.getTime() - start.getTime();
  if (diffMs < 0) return "-"; 
  
  const days = diffMs / (1000 * 60 * 60 * 24);
  return `${days.toFixed(1)} D`;
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
  let csvContent = "DEPT,KODE TOKO,NAMA TOKO,NO TICKET,MASALAH,PIC,USIA/TARGET,INDIKATOR,STATUS\n";
  
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
  if (total === 0) return { 
      total:0, newT:0, progT:0, solveT:0, closed:0, 
      pct:"0.0", convC:"1.00", sla:"0.0", convS:"1.00", 
      puas:"0.0", convK:"1.00", final:"0.00",
      avgNPStr:"-", avgPSStr:"-", avgSCStr:"-"
  };

  let closed = 0, newT = 0, progT = 0, solveT = 0;
  let totalNP = 0, countNP = 0;
  let totalPS = 0, countPS = 0;
  let totalSC = 0, countSC = 0;

  records.forEach(r => {
      const status = String(getVal(r, ['Status']) || '').trim().toLowerCase();
      if (['closed'].includes(status)) closed++;
      else if (['new'].includes(status)) newT++;
      else if (status.includes('progress')) progT++;
      else if (status.includes('solve')) solveT++;

      let tglMulai = getVal(r, ['Tgl Eskalasi']);
      if (!tglMulai || String(tglMulai).trim() === '' || String(tglMulai) === '-') {
          tglMulai = getVal(r, ['Tgl Problem']);
      }
      
      const dTerima = parseCustomDate(tglMulai);
      const dProgress = parseCustomDate(getVal(r, ['Tgl Progress']));
      const dSolve = parseCustomDate(getVal(r, ['Tgl Solve']));
      const dClose = parseCustomDate(getVal(r, ['Tgl Close', 'Tgl Closed']));

      const np = calculateDurationMs(dTerima, dProgress);
      if (np !== null) { totalNP += np; countNP++; }

      const ps = calculateDurationMs(dProgress, dSolve);
      if (ps !== null) { totalPS += ps; countPS++; }

      const sc = calculateDurationMs(dSolve, dClose);
      if (sc !== null) { totalSC += sc; countSC++; }
  });
  
  const avgNP = countNP > 0 ? totalNP / countNP : null;
  const avgPS = countPS > 0 ? totalPS / countPS : null;
  const avgSC = countSC > 0 ? totalSC / countSC : null;

  const pctClosed = (closed / total) * 100;
  const totalSla = records.reduce((sum, r) => sum + parseNum(getVal(r, ['ACH SLA FIX'])), 0);
  const avgSla = totalSla / total;
  
  let countPuas = 0;
  const totalPuas = records.reduce((sum, r) => {
      const val = parseNum(getVal(r, ['TINGKAT KEPUASAN OLAHAN']));
      if (val > 0) {
          countPuas++;
          return sum + val;
      }
      return sum;
  }, 0);
  
  const avgPuas = countPuas > 0 ? totalPuas / countPuas : 0;
  
  const convC = getScale(pctClosed, 'closed');
  const convS = getScale(avgSla, 'sla');
  const convK = getScale(avgPuas, 'puas');
  
  const finalScore = (convC * 0.3) + (convS * 0.5) + (convK * 0.2);

  return {
    total, newT, progT, solveT, closed, 
    pct: pctClosed.toFixed(1), 
    convC: convC.toFixed(2),
    sla: isNaN(avgSla) ? "0.0" : avgSla.toFixed(1), 
    convS: convS.toFixed(2), 
    puas: isNaN(avgPuas) ? "0.0" : avgPuas.toFixed(2), 
    convK: convK.toFixed(2),
    final: finalScore.toFixed(2),
    avgNPStr: msToDecimalDays(avgNP),
    avgPSStr: msToDecimalDays(avgPS),
    avgSCStr: msToDecimalDays(avgSC)
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
      <div data-dept="${d.name.replace(/"/g, '&quot;')}"
           onclick="selectDept('${d.name.replace(/'/g, "\\'")}', this, ${i + 1})" 
           class="dept-item cursor-pointer p-3 mb-2 rounded-xl border-l-4 transition-all group ${activeDeptName === d.name ? 'bg-indigo-50 border-indigo-500 shadow-sm' : 'border-transparent hover:bg-slate-100'}">
        <div class="flex justify-between items-center mb-1.5">
          <span class="text-[9px] font-black uppercase text-slate-500 bg-slate-200/60 px-2 py-0.5 rounded-md">Rank #${i + 1}</span>
          <span class="text-[11px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">${d.final}</span>
        </div>
        <h3 class="text-xs font-bold text-slate-700 uppercase truncate" title="${d.name}">${d.name}</h3>
      </div>
    `).join('');
  }

  const isRankViewActive = !document.getElementById('view-rank').classList.contains('hidden');
  const isDeptViewActive = !document.getElementById('view-dept').classList.contains('hidden');

  if (isRankViewActive) {
      showRankView();
  } else if (isDeptViewActive && activeDeptName) {
      const currentRank = rankedDepts.findIndex(d => d.name === activeDeptName) + 1;
      updateDeptView(activeDeptName, currentRank || '-');
  } else {
      showHome();
  }
}

function renderMetrikBox(containerId, m) {
  const container = document.getElementById(containerId);
  if(!container) return;
  
  container.innerHTML = `
    <div class="bg-white border border-slate-200 shadow-sm p-4 rounded-2xl flex flex-col justify-between min-h-[90px]">
      <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Total Problem</p>
      <p class="text-2xl font-black italic tracking-tight text-slate-800">${m.total}</p>
    </div>
    
    <div class="bg-white border border-slate-200 shadow-sm p-3 rounded-2xl flex flex-col justify-center min-h-[90px] gap-1">
      <div class="flex justify-between items-center w-full">
        <span class="text-[10px] font-bold text-slate-400 uppercase">New</span>
        <span class="text-[11px] sm:text-xs font-black text-slate-700 bg-slate-100 px-2 py-0.5 rounded">${m.newT}</span>
      </div>
      <div class="flex justify-between items-center w-full">
        <span class="text-[10px] font-bold text-slate-400 uppercase">Prog</span>
        <span class="text-[11px] sm:text-xs font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded">${m.progT}</span>
      </div>
      <div class="flex justify-between items-center w-full">
        <span class="text-[10px] font-bold text-slate-400 uppercase">Slv</span>
        <span class="text-[11px] sm:text-xs font-black text-teal-600 bg-teal-50 px-2 py-0.5 rounded">${m.solveT}</span>
      </div>
    </div>

    <div class="bg-white border border-slate-200 shadow-sm p-4 rounded-2xl flex flex-col justify-between min-h-[90px]">
      <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Closed</p>
      <p class="text-2xl font-black italic tracking-tight text-emerald-600">${m.closed}</p>
    </div>
    <div class="bg-white border border-slate-200 shadow-sm p-4 rounded-2xl flex flex-col justify-between min-h-[90px]">
      <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">% Closed</p>
      <p class="text-2xl font-black italic tracking-tight text-emerald-600">${m.pct}%</p>
    </div>
    <div class="bg-white border border-slate-200 shadow-sm p-4 rounded-2xl flex flex-col justify-between min-h-[90px]">
      <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Konv (C)</p>
      <p class="text-2xl font-black italic tracking-tight text-emerald-500">${m.convC}</p>
    </div>
    <div class="bg-white border border-slate-200 shadow-sm p-4 rounded-2xl flex flex-col justify-between min-h-[90px]">
      <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Avg SLA %</p>
      <p class="text-2xl font-black italic tracking-tight text-blue-600">${m.sla}</p>
    </div>
    <div class="bg-white border border-slate-200 shadow-sm p-4 rounded-2xl flex flex-col justify-between min-h-[90px]">
      <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Konv (S)</p>
      <p class="text-2xl font-black italic tracking-tight text-blue-500">${m.convS}</p>
    </div>
    <div class="bg-white border border-slate-200 shadow-sm p-4 rounded-2xl flex flex-col justify-between min-h-[90px]">
      <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Avg Puas</p>
      <p class="text-2xl font-black italic tracking-tight text-amber-600">${m.puas}</p>
    </div>
    <div class="bg-white border border-slate-200 shadow-sm p-4 rounded-2xl flex flex-col justify-between min-h-[90px]">
      <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Konv (K)</p>
      <p class="text-2xl font-black italic tracking-tight text-amber-500">${m.convK}</p>
    </div>
    <div class="bg-gradient-to-r from-indigo-600 to-indigo-500 shadow-md border-transparent p-4 rounded-2xl flex flex-col justify-between min-h-[90px]">
      <p class="text-[10px] font-bold text-indigo-100 uppercase tracking-wider mb-1">Score Layanan</p>
      <p class="text-2xl font-black italic tracking-tight text-white">${m.final}</p>
    </div>
  `;
}

function showGroupDetail(groupName, groupKeyStr) {
    let dataToUse = filteredData;
    if (activeDeptName) {
        dataToUse = filteredData.filter(d => String(getVal(d, ['Departement']) || 'N/A').trim() === activeDeptName);
    }
    
    const groupData = dataToUse.filter(d => String(getVal(d, [groupKeyStr]) || 'N/A').trim() === groupName);
    
    const titleEl = document.getElementById('group-modal-title');
    titleEl.innerText = groupKeyStr.includes('Masalah') ? `Problem: ${groupName}` : `Kinerja PIC: ${groupName}`;
    
    // Inject Averages Data to Header Modal Group dengan desain yang lebih besar & eye-catching
    const metrics = calculateMetrics(groupData);
    document.getElementById('group-modal-averages').innerHTML = `
        <div class="bg-blue-50 text-blue-600 px-4 py-2 sm:py-3 rounded-2xl border border-blue-200 flex flex-col items-center justify-center shadow-sm min-w-[110px]">
            <span class="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-blue-500 mb-1">New to Progress</span>
            <span class="text-base sm:text-xl font-black leading-none">${metrics.avgNPStr}</span>
        </div>
        <div class="bg-teal-50 text-teal-600 px-4 py-2 sm:py-3 rounded-2xl border border-teal-200 flex flex-col items-center justify-center shadow-sm min-w-[110px]">
            <span class="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-teal-500 mb-1">Progress to Solve</span>
            <span class="text-base sm:text-xl font-black leading-none">${metrics.avgPSStr}</span>
        </div>
        <div class="bg-emerald-50 text-emerald-600 px-4 py-2 sm:py-3 rounded-2xl border border-emerald-200 flex flex-col items-center justify-center shadow-sm min-w-[110px]">
            <span class="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-emerald-500 mb-1">Solve to Close</span>
            <span class="text-base sm:text-xl font-black leading-none">${metrics.avgSCStr}</span>
        </div>
    `;
    
    renderGroupTicketsTable(groupData, 'group-modal-body');
    
    const modal = document.getElementById('group-modal');
    const content = document.getElementById('group-modal-content');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        content.classList.remove('scale-95');
    }, 10);
}

function closeGroupModal() {
    const modal = document.getElementById('group-modal');
    const content = document.getElementById('group-modal-content');
    modal.classList.add('opacity-0');
    content.classList.add('scale-95');
    setTimeout(() => {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }, 300);
}

function renderGroupTicketsTable(data, tbodyId) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    
    const processed = data.map(d => {
        let tglRawStr = getVal(d, ['Tgl Eskalasi']);
        if (!tglRawStr || String(tglRawStr).trim() === '' || String(tglRawStr).trim() === '-') {
            tglRawStr = getVal(d, ['Tgl Problem']);
        }
        const tgl = parseCustomDate(tglRawStr);
        const targetDays = parseNum(getVal(d, ['Target Hari']));
        let usiaHariNum = 0;
        let label = 'SECURED', badge = 'bg-emerald-500'; 
        
        const status = String(getVal(d, ['Status']) || '').trim().toLowerCase();
        const isClosed = status.includes('closed');
        const isSolved = status.includes('solve');

        if (tgl && targetDays > 0) {
            const dClose = parseCustomDate(getVal(d, ['Tgl Close', 'Tgl Closed']));
            const dSolve = parseCustomDate(getVal(d, ['Tgl Solve']));
            
            let endTgl = new Date();
            // Berhenti menghitung usia jika sudah solve/close
            if (isClosed || isSolved) {
                if (dClose) endTgl = dClose;
                else if (dSolve) endTgl = dSolve;
            }

            const diffMsReal = endTgl.getTime() - tgl.getTime();
            const safeDiff = diffMsReal < 0 ? 0 : diffMsReal;
            
            usiaHariNum = safeDiff / (1000 * 60 * 60 * 24);
            d.usiaHariStr = `${usiaHariNum.toFixed(1)} D`;
            
            // Logika label SLA (tetap diperlihatkan performanya meskipun sudah closed)
            if (usiaHariNum > targetDays) { label = 'OVERDUE'; badge = 'bg-red-500'; }
            else if (usiaHariNum >= (targetDays * 0.7)) { label = 'WARNING'; badge = 'bg-amber-400'; } 
            else { label = 'SECURED'; badge = 'bg-emerald-500'; }
            
        } else {
            d.usiaHariStr = "-";
            label = 'NO TGT'; badge = 'bg-slate-400';
        }

        d.usiaHariSort = usiaHariNum;

        return { 
          ...d, 
          targetDays: targetDays || '-', 
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
    });
    
    // Sort berdasar usia terbesar ke terkecil
    processed.sort((a,b) => parseFloat(b.usiaHariSort) - parseFloat(a.usiaHariSort));
    
    tbody.innerHTML = processed.map(d => `
        <tr class="text-[9px] hover:bg-slate-100 border-b border-slate-100 cursor-pointer transition-colors" onclick="showTicketDetail('${d.noTicket.replace(/'/g, "\\'")}')">
          <td class="p-3 sm:p-4 font-bold text-slate-500 truncate max-w-[80px]" title="${d.dept}">${d.dept}</td>
          <td class="p-3 sm:p-4 font-bold text-slate-700">${d.kodeToko}</td>
          <td class="p-3 sm:p-4 font-bold text-slate-700 truncate max-w-[100px]" title="${d.namaToko}">${d.namaToko}</td>
          <td class="p-3 sm:p-4 font-mono font-bold text-indigo-600">${d.noTicket}</td>
          <td class="p-3 sm:p-4 truncate max-w-[120px]" title="${d.masalah}">${d.masalah}</td>
          <td class="p-3 sm:p-4 truncate font-semibold max-w-[80px]" title="${d.pic}">${d.pic}</td>
          <td class="p-3 sm:p-4 text-center font-bold text-slate-600">${d.usiaHariStr} / ${d.targetDays} D</td>
          <td class="p-3 sm:p-4 text-center font-bold text-slate-600 uppercase">${d.sheetStatus}</td>
          <td class="p-3 sm:p-4 text-center"><span class="${d.badge} text-white px-2 py-1 rounded-md font-bold shadow-sm">${d.label}</span></td>
        </tr>
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
  
  const groupKeyStr = groupKeyObj[0];

  tbody.innerHTML = resultArr.slice(0, 50).map(i => `
    <tr class="hover:bg-slate-100 transition-colors text-[9px] sm:text-[10px] cursor-pointer border-b border-slate-50 group" onclick="showGroupDetail('${i.name.replace(/'/g, "\\'")}', '${groupKeyStr}')">
      <td class="p-2 sm:p-3 font-semibold text-slate-700 truncate group-hover:text-indigo-600 transition-colors" title="${i.name}">${i.name}</td>
      <td class="p-2 sm:p-3 text-center">${i.total}</td>
      <td class="p-2 sm:p-3 text-center text-emerald-600 font-bold">${i.closed}</td>
      <td class="p-2 sm:p-3 text-center">${i.pct}%</td>
      <td class="p-2 sm:p-3 text-center font-semibold text-slate-500">${i.avgNPStr}</td>
      <td class="p-2 sm:p-3 text-center font-semibold text-slate-500">${i.avgPSStr}</td>
      <td class="p-2 sm:p-3 text-center font-semibold text-slate-500">${i.avgSCStr}</td>
      <td class="p-2 sm:p-3 text-center text-blue-600">${i.sla}</td>
      <td class="p-2 sm:p-3 text-center text-amber-600">${i.puas}</td>
      <td class="p-2 sm:p-3 text-center font-black text-indigo-700">${i.final}</td>
    </tr>
  `).join('');
}

function filterWarningTable(label, tbodyId) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    const rows = tbody.querySelectorAll('tr');

    rows.forEach(row => {
        if (label === 'ALL') {
            row.style.display = '';
        } else {
            const indicatorCell = row.querySelector('td:nth-last-child(1) span');
            if (indicatorCell && indicatorCell.innerText.trim().toUpperCase() === label) {
                row.style.display = '';
            } else {
                row.style.display = 'none';
            }
        }
    });
}

function renderWarningBadges(criticalArray, badgeContainerId, tbodyId) {
    const container = document.getElementById(badgeContainerId);
    if (!container) return;

    let overdue = 0;
    let warning = 0;
    let secured = 0;

    criticalArray.forEach(d => {
        if (d.label === 'OVERDUE') overdue++;
        else if (d.label === 'WARNING') warning++;
        else if (d.label === 'SECURED') secured++;
    });

    container.innerHTML = `
        <span onclick="filterWarningTable('OVERDUE', '${tbodyId}')" class="text-[9px] bg-red-100 text-red-700 hover:bg-red-200 hover:scale-105 px-2 py-0.5 rounded-full font-bold shadow-sm cursor-pointer transition-all border border-transparent">Overdue: ${overdue}</span>
        <span onclick="filterWarningTable('WARNING', '${tbodyId}')" class="text-[9px] bg-amber-100 text-amber-700 hover:bg-amber-200 hover:scale-105 px-2 py-0.5 rounded-full font-bold shadow-sm cursor-pointer transition-all border border-transparent">Warning: ${warning}</span>
        <span onclick="filterWarningTable('SECURED', '${tbodyId}')" class="text-[9px] bg-emerald-100 text-emerald-700 hover:bg-emerald-200 hover:scale-105 px-2 py-0.5 rounded-full font-bold shadow-sm cursor-pointer transition-all border border-transparent">Secured: ${secured}</span>
        <span onclick="filterWarningTable('ALL', '${tbodyId}')" class="text-[9px] bg-slate-100 text-slate-600 hover:bg-slate-200 hover:scale-105 px-2 py-0.5 rounded-full font-bold shadow-sm cursor-pointer transition-all ml-1 border border-slate-200">Reset View</span>
    `;
}

function renderWarningTable(baseData, tableId, badgeContainerId) {
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
    
    let usiaHariNum = 0;
    let label = 'SECURED', badge = 'bg-emerald-500'; 
    
    if (tgl && targetDays > 0) {
        const diffMsReal = new Date().getTime() - tgl.getTime();
        const safeDiff = diffMsReal < 0 ? 0 : diffMsReal;
        usiaHariNum = safeDiff / (1000 * 60 * 60 * 24);
        
        if (usiaHariNum > targetDays) { label = 'OVERDUE'; badge = 'bg-red-500'; }
        else if (usiaHariNum >= (targetDays * 0.7)) { label = 'WARNING'; badge = 'bg-amber-400'; } 
    } else {
        label = 'NO TGT'; badge = 'bg-slate-400';
    }

    return { 
      ...d, 
      usiaHariStr: usiaHariNum.toFixed(1), 
      usiaHariSort: usiaHariNum,
      targetDays: targetDays || '-', 
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
  
  critical.sort((a,b) => parseFloat(b.usiaHariSort) - parseFloat(a.usiaHariSort));

  renderWarningBadges(critical, badgeContainerId, tableId);
  
  tbody.innerHTML = critical.map(d => `
    <tr class="text-[9px] hover:bg-slate-100 border-b border-slate-100 cursor-pointer transition-colors" onclick="showTicketDetail('${d.noTicket.replace(/'/g, "\\'")}')">
      <td class="p-3 sm:p-4 font-bold text-slate-500 truncate max-w-[80px]" title="${d.dept}">${d.dept}</td>
      <td class="p-3 sm:p-4 font-bold text-slate-700">${d.kodeToko}</td>
      <td class="p-3 sm:p-4 font-bold text-slate-700 truncate max-w-[100px]" title="${d.namaToko}">${d.namaToko}</td>
      <td class="p-3 sm:p-4 font-mono font-bold text-indigo-600">${d.noTicket}</td>
      <td class="p-3 sm:p-4 truncate max-w-[120px]" title="${d.masalah}">${d.masalah}</td>
      <td class="p-3 sm:p-4 truncate font-semibold max-w-[80px]" title="${d.pic}">${d.pic}</td>
      <td class="p-3 sm:p-4 text-center font-bold text-slate-600">${d.usiaHariStr} / ${d.targetDays} D</td>
      <td class="p-3 sm:p-4 text-center font-bold text-slate-600 uppercase">${d.sheetStatus}</td>
      <td class="p-3 sm:p-4 text-center"><span class="${d.badge} text-white px-2 py-1 rounded-md font-bold shadow-sm">${d.label}</span></td>
    </tr>
  `).join('');
}

function showTicketDetail(ticketId) {
    const tiket = rawData.find(r => String(getVal(r, ['No Problem'])).trim() === String(ticketId).trim());
    if (!tiket) return;

    document.getElementById('modal-ticket-id').innerText = getVal(tiket, ['No Problem']) || '-';
    document.getElementById('modal-ticket-dept').innerText = getVal(tiket, ['Departement']) || '-';
    
    const kodeToko = getVal(tiket, ['Kode Toko']) || '-';
    const namaToko = getVal(tiket, ['Nama Toko']) || '-';
    document.getElementById('modal-ticket-toko').innerText = `${kodeToko} - ${namaToko}`;
    document.getElementById('modal-ticket-toko').title = `${kodeToko} - ${namaToko}`;
    
    document.getElementById('modal-ticket-pic').innerText = getVal(tiket, ['Nama Penangung']) || '-';
    
    document.getElementById('modal-ticket-masalah').innerText = getVal(tiket, ['Masalah']) || '-';
    document.getElementById('modal-ticket-desc').innerText = getVal(tiket, ['Deskripsi Masalah', 'Deskripsi']) || 'Tidak ada deskripsi rinci tersedia.';
    
    let tglMulai = getVal(tiket, ['Tgl Eskalasi']);
    if (!tglMulai || String(tglMulai).trim() === '' || String(tglMulai) === '-') {
        tglMulai = getVal(tiket, ['Tgl Problem']);
    }
    
    const dTerima = parseCustomDate(tglMulai);
    const dProgress = parseCustomDate(getVal(tiket, ['Tgl Progress']));
    const dSolve = parseCustomDate(getVal(tiket, ['Tgl Solve']));
    const dClose = parseCustomDate(getVal(tiket, ['Tgl Close', 'Tgl Closed']));

    document.getElementById('modal-ticket-tgl-terima').innerText = formatUIDate(dTerima);
    document.getElementById('modal-ticket-tgl-progress').innerText = formatUIDate(dProgress);
    document.getElementById('modal-ticket-tgl-solve').innerText = formatUIDate(dSolve);
    document.getElementById('modal-ticket-tgl-close').innerText = formatUIDate(dClose);

    const durProg = calculateDurationDecimal(dTerima, dProgress);
    const durSolve = calculateDurationDecimal(dProgress, dSolve);
    const durClose = calculateDurationDecimal(dSolve, dClose);

    document.getElementById('modal-ticket-dur-prog').innerText = durProg !== "-" ? durProg : "-";
    document.getElementById('modal-ticket-dur-solve').innerText = durSolve !== "-" ? durSolve : "-";
    document.getElementById('modal-ticket-dur-close').innerText = durClose !== "-" ? durClose : "-";

    let urgencyLabel = 'SECURED';
    let urgencyBadgeClass = 'bg-emerald-500 text-white';
    let usiaTextClass = 'text-emerald-600';

    const targetDays = parseNum(getVal(tiket, ['Target Hari']));
    let usiaLabel = "Belum dihitung";
    
    const status = String(getVal(tiket, ['Status']) || '-').toUpperCase();
    const isClosed = status.includes('CLOSED');
    const isSolved = status.includes('SOLVE');
    
    if (dTerima && targetDays > 0) {
        let endTgl = new Date();
        // Jika statusnya solve atau closed, usia berhenti dihitung saat hari itu
        if (isClosed || isSolved) {
            if (dClose) endTgl = dClose;
            else if (dSolve) endTgl = dSolve;
        }

        const diffMsReal = endTgl.getTime() - dTerima.getTime();
        const safeDiff = diffMsReal < 0 ? 0 : diffMsReal;
        
        const usiaHariNum = safeDiff / (1000 * 60 * 60 * 24);
        
        usiaLabel = `${usiaHariNum.toFixed(1)} D dari Target ${targetDays} D`;
        
        // Logika warna label status (berlaku historis kalau sudah closed/solve)
        if (usiaHariNum > targetDays) { 
            urgencyLabel = 'OVERDUE'; 
            urgencyBadgeClass = 'bg-red-500 text-white'; 
            usiaTextClass = 'text-red-600';
        } else if (usiaHariNum >= (targetDays * 0.7)) { 
            urgencyLabel = 'WARNING'; 
            urgencyBadgeClass = 'bg-amber-400 text-white'; 
            usiaTextClass = 'text-amber-600';
        } else {
            urgencyLabel = 'SECURED';
        }
    } else {
        urgencyLabel = 'NO TGT';
        urgencyBadgeClass = 'bg-slate-400 text-white';
        usiaTextClass = 'text-slate-600';
    }

    const usiaEl = document.getElementById('modal-ticket-usia');
    usiaEl.innerText = usiaLabel;
    usiaEl.className = `text-xs sm:text-sm font-black mt-1 ${usiaTextClass}`; 

    document.getElementById('modal-ticket-status').innerText = status;
    
    const indicatorSpan = document.getElementById('modal-ticket-indicator');
    if (isClosed) {
        indicatorSpan.className = 'text-[9px] px-2 py-0.5 rounded text-white font-bold shadow-sm bg-emerald-500';
        indicatorSpan.innerText = 'SELESAI';
    } else {
        indicatorSpan.className = 'text-[9px] px-2 py-0.5 rounded text-white font-bold shadow-sm bg-blue-500';
        indicatorSpan.innerText = 'OPEN';
    }

    const urgencySpan = document.getElementById('modal-ticket-urgency');
    urgencySpan.innerText = urgencyLabel;
    urgencySpan.className = `text-[9px] px-2 py-0.5 rounded font-bold shadow-sm ${urgencyBadgeClass}`;
    urgencySpan.classList.remove('hidden');

    const modal = document.getElementById('ticket-modal');
    const content = document.getElementById('ticket-modal-content');
    
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        content.classList.remove('scale-95');
    }, 10);
}

function closeTicketModal() {
    const modal = document.getElementById('ticket-modal');
    const content = document.getElementById('ticket-modal-content');
    
    modal.classList.add('opacity-0');
    content.classList.add('scale-95');
    
    setTimeout(() => {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }, 300);
}

function showHome() {
  activeDeptName = null;
  document.getElementById('view-home')?.classList.remove('hidden');
  document.getElementById('view-dept')?.classList.add('hidden');
  document.getElementById('view-rank')?.classList.add('hidden');
  document.getElementById('btn-home')?.classList.add('nav-item-active');
  
  document.querySelectorAll('.dept-item').forEach(e => {
    e.classList.remove('bg-indigo-50', 'border-indigo-500', 'shadow-sm');
    e.classList.add('border-transparent', 'hover:bg-slate-100');
  });
  
  const m = calculateMetrics(filteredData);
  renderMetrikBox('home-metrics', m);
  
  renderDetailTable(filteredData, ['Masalah'], 'home-body-prob', false);
  renderDetailTable(filteredData, ['Nama Penangung'], 'home-body-pic', true); 
  
  renderWarningTable(rawData, 'home-body-warn', 'home-warn-badges');

  if (window.innerWidth < 1024) {
      const sidebarOverlay = document.getElementById('sidebar-overlay');
      if (sidebarOverlay && !sidebarOverlay.classList.contains('hidden')) {
          toggleSidebar();
      }
  }
}

function selectDept(deptName, el, rank) {
  activeDeptName = deptName;
  updateDeptView(deptName, rank);
  
  if (window.innerWidth < 1024) {
      const sidebarOverlay = document.getElementById('sidebar-overlay');
      if (sidebarOverlay && !sidebarOverlay.classList.contains('hidden')) {
          toggleSidebar();
      }
  }
}

function updateDeptView(deptName, rank) {
  document.getElementById('view-home')?.classList.add('hidden');
  document.getElementById('view-rank')?.classList.add('hidden');
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
  renderWarningTable(deptDataRaw, 'dept-body-warn', 'dept-warn-badges');

  document.querySelectorAll('.dept-item').forEach(e => {
    const itemName = e.getAttribute('data-dept');
    if (itemName === deptName) {
      e.classList.add('bg-indigo-50', 'border-indigo-500', 'shadow-sm');
      e.classList.remove('border-transparent', 'hover:bg-slate-100');
    } else {
      e.classList.remove('bg-indigo-50', 'border-indigo-500', 'shadow-sm');
      e.classList.add('border-transparent', 'hover:bg-slate-100');
    }
  });
}

function showRankView() {
    activeDeptName = null;
    
    document.getElementById('view-home')?.classList.add('hidden');
    document.getElementById('view-dept')?.classList.add('hidden');
    document.getElementById('view-rank')?.classList.remove('hidden');

    document.getElementById('btn-home')?.classList.remove('nav-item-active');
    
    document.querySelectorAll('.dept-item').forEach(e => {
        e.classList.remove('bg-indigo-50', 'border-indigo-500', 'shadow-sm');
        e.classList.add('border-transparent', 'hover:bg-slate-100');
    });

    if (window.innerWidth < 1024) {
        const sidebarOverlay = document.getElementById('sidebar-overlay');
        if (sidebarOverlay && !sidebarOverlay.classList.contains('hidden')) {
            toggleSidebar();
        }
    }

    const tbody = document.getElementById('rank-body');
    if (!tbody || !rankedDepts) return;

    tbody.innerHTML = rankedDepts.map((d, i) => {
        let rankBadge = '';
        let rowBgClass = 'bg-white hover:bg-indigo-50/50';
        
        if (i === 0) {
            rankBadge = '<span class="text-2xl sm:text-3xl drop-shadow-md" title="Juara 1">🥇</span>';
            rowBgClass = 'bg-gradient-to-r from-yellow-50/50 to-white hover:from-yellow-100/50';
        } else if (i === 1) {
            rankBadge = '<span class="text-xl sm:text-2xl drop-shadow-md" title="Juara 2">🥈</span>';
            rowBgClass = 'bg-gradient-to-r from-slate-50 to-white hover:from-slate-100';
        } else if (i === 2) {
            rankBadge = '<span class="text-xl sm:text-2xl drop-shadow-md" title="Juara 3">🥉</span>';
            rowBgClass = 'bg-gradient-to-r from-orange-50/30 to-white hover:from-orange-100/30';
        } else {
            rankBadge = `<span class="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-slate-100 border border-slate-200 text-slate-500 flex items-center justify-center text-[10px] sm:text-xs font-black mx-auto shadow-inner">${i + 1}</span>`;
        }

        return `
            <tr class="${rowBgClass} transition-all text-xs cursor-pointer group border-b border-slate-100" onclick="selectDept('${d.name.replace(/'/g, "\\'")}', null, ${i + 1})">
                <td class="p-3 sm:p-4 text-center w-12 sm:w-16">${rankBadge}</td>
                <td class="p-3 sm:p-4 font-black text-indigo-700 uppercase whitespace-nowrap tracking-tight group-hover:text-indigo-600 transition-colors">${d.name}</td>
                <td class="p-3 sm:p-4 text-center font-bold text-slate-600">${d.total}</td>
                <td class="p-3 sm:p-4 text-center text-emerald-600 font-black">${d.closed}</td>
                <td class="p-3 sm:p-4 text-center font-bold text-slate-700">${d.pct}%</td>
                <td class="p-3 sm:p-4 text-center text-blue-600 font-bold">${d.sla}</td>
                <td class="p-3 sm:p-4 text-center text-amber-600 font-bold">${d.puas}</td>
                <td class="p-3 sm:p-4 text-center">
                    <span class="inline-block px-3 py-1.5 sm:px-4 sm:py-2 bg-indigo-500 text-white font-black rounded-lg shadow-sm border-b-[3px] border-indigo-700 group-hover:bg-indigo-400 group-hover:translate-y-[1px] group-hover:border-b-[2px] transition-all text-[10px] sm:text-xs w-full sm:w-auto">
                        ${d.final}
                    </span>
                </td>
            </tr>
        `;
    }).join('');
}

async function initApp() {
  const listEl = document.getElementById('dept-list');
  const metricsEl = document.getElementById('home-metrics');
  const statusEl = document.getElementById('global-last-update');
  const syncIcon = document.getElementById('sync-icon');
  
  try {
    if (statusEl) {
        statusEl.innerText = "MENGAMBIL DATA...";
        statusEl.classList.remove('text-indigo-600', 'text-red-500', 'text-emerald-600');
        statusEl.classList.add('text-amber-500');
    }
    if (syncIcon) syncIcon.classList.add('animate-spin');
    
    const response = await fetch(API_URL);
    if (!response.ok) throw new Error("Gagal terhubung ke server");
    
    const result = await response.json();
    
    if (result.status === "error") {
        throw new Error(result.message || "API Error");
    }
    
    rawData = Array.isArray(result) ? result : (result.data || []);
    
    try {
        localStorage.setItem("aho_raw_data", JSON.stringify(rawData));
    } catch (storageErr) {
        console.warn("Storage penuh, data terlalu besar untuk cache lokal, tapi sistem tetap berjalan normal:", storageErr);
    }

    if (!rawData || rawData.length === 0) {
      if (listEl) listEl.innerHTML = `<p class="p-4 text-center text-red-500 font-bold">Data Kosong</p>`;
      if (statusEl) {
          statusEl.innerText = "DATA KOSONG";
          statusEl.classList.remove('text-amber-500');
          statusEl.classList.add('text-red-500');
      }
      return;
    }

    applyFilters(); 
    
    if (statusEl) {
      statusEl.innerText = `SYNCED: ${new Date().toLocaleTimeString('id-ID', { hour12: false })}`;
      statusEl.classList.remove('text-amber-500', 'text-red-500', 'text-indigo-600');
      statusEl.classList.add('text-emerald-600');
    }

  } catch (error) {
    console.error("Error initApp:", error);
    
    if (statusEl) {
        statusEl.innerText = "GAGAL SYNC (PAKAI CACHE)";
        statusEl.classList.remove('text-amber-500', 'text-emerald-600', 'text-indigo-600');
        statusEl.classList.add('text-red-500');
    }
    
    if(rawData && rawData.length > 0) {
        applyFilters();
    } else {
        if (listEl) listEl.innerHTML = `<p class="p-4 text-center text-red-500 font-bold">Error Koneksi API</p>`;
        if (metricsEl) metricsEl.innerHTML = `<div class="col-span-full p-6 sm:p-10 text-center bg-white rounded-2xl shadow-sm border border-red-100">
          <p class="text-red-500 font-bold uppercase text-sm sm:text-base">Gagal Memuat Dashboard</p>
          <p class="text-slate-400 text-[9px] sm:text-[10px] mt-2">Pastikan internet stabil & API Script merespons.</p>
        </div>`;
    }
  } finally {
    if (syncIcon) syncIcon.classList.remove('animate-spin');
  }
}
