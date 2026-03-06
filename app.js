// Konfigurasi API
// Gunakan URL Deployment Web App Anda, tambahkan ?api=true di belakangnya
const API_URL = "https://script.google.com/macros/s/AKfycbzyuvfQKpXqP-1ukcNCcc7CxIJ6QjY5HPkhT3sFbPI_yerr0eaRY1Fz-jgwc32mAsJ5/exec"; 

let rawData = [];
let rankedDepts = [];

// ==========================================
// 1. RUMUS KONVERSI INTERVAL & PEMBOBOTAN
// ==========================================
function convertScale(value, type) {
  if (type === 'closed') {
    if (value < 85) return 1;
    if (value >= 100) return 4;
    return 1 + ((value - 85) / 14.99) * 2.99;
  }
  if (type === 'sla') {
    if (value < 85) return 1;
    if (value >= 130) return 4;
    return 1 + ((value - 85) / 44.99) * 2.99;
  }
  if (type === 'puas') {
    if (value < 1) return 1;
    if (value >= 4) return 4;
    return 1 + ((value - 1) / 3) * 2.99;
  }
  return 1;
}

function calculateMetrics(records) {
  if (records.length === 0) return { closed: 0, sla: 0, puas: 0, score: 0, count: 0 };
  
  const total = records.length;
  const closedCount = records.filter(r => r.Status === 'Closed').length;
  const closedPerc = (closedCount / total) * 100;
  
  const avgSla = records.reduce((sum, r) => sum + (parseFloat(r['ACH SLA']) || 0), 0) / total;
  const avgPuas = records.reduce((sum, r) => sum + (parseFloat(r['Tingkat Kepuasan']) || 0), 0) / total;
  
  // Konversi
  const valClosed = convertScale(closedPerc, 'closed');
  const valSla = convertScale(avgSla, 'sla');
  const valPuas = convertScale(avgPuas, 'puas');
  
  // Sesuai requirement: bobot 30% closed, 40% sla, 20% kepuasan
  const finalScore = (valClosed * 0.3) + (valSla * 0.4) + (valPuas * 0.2);
  
  return {
    closedRaw: closedPerc.toFixed(1) + '%',
    slaRaw: avgSla.toFixed(1),
    puasRaw: avgPuas.toFixed(1),
    score: finalScore.toFixed(2),
    count: total
  };
}

// ==========================================
// 2. INISIALISASI & FETCH DATA
// ==========================================
async function init() {
  try {
    const res = await fetch(API_URL);
    rawData = await res.json();
    processDepartments();
  } catch (error) {
    document.getElementById('dept-list').innerHTML = `<div class="p-4 text-red-500 text-xs font-bold">Gagal memuat API.</div>`;
    console.error(error);
  }
}

function processDepartments() {
  // Ambil departemen unik (Abaikan yang kosong)
  const uniqueDepts = [...new Set(rawData.map(d => d.Departemen).filter(n => n && n.trim() !== ''))];
  
  // Hitung score per departemen
  rankedDepts = uniqueDepts.map(deptName => {
    const deptData = rawData.filter(d => d.Departemen === deptName);
    const metrics = calculateMetrics(deptData);
    return { name: deptName, ...metrics };
  });
  
  // Urutkan berdasarkan Score tertinggi
  rankedDepts.sort((a, b) => b.score - a.score);
  
  // Render Sidebar
  const listEl = document.getElementById('dept-list');
  listEl.innerHTML = rankedDepts.map((d, index) => `
    <div onclick="selectDept('${d.name.replace(/'/g, "\\'")}', this, ${index + 1})" 
         class="dept-item cursor-pointer p-3 rounded-lg hover:bg-slate-50 border-l-4 border-transparent transition-all group">
      <div class="flex justify-between items-center mb-1">
        <span class="text-[9px] font-black text-slate-400 group-hover:text-indigo-500 uppercase">Rank #${index + 1}</span>
        <span class="text-[10px] font-black bg-slate-100 text-indigo-700 px-2 py-0.5 rounded">${d.score}</span>
      </div>
      <h3 class="text-xs font-bold text-slate-700 uppercase italic truncate">${d.name}</h3>
    </div>
  `).join('');
}

// ==========================================
// 3. RENDER DETAIL DEPARTEMEN
// ==========================================
function selectDept(deptName, el, rank) {
  // Styling active state
  document.querySelectorAll('.dept-item').forEach(e => e.classList.remove('active-dept'));
  el.classList.add('active-dept');
  
  document.getElementById('detail-view').classList.remove('hidden');
  document.getElementById('dept-name').innerText = deptName;
  document.getElementById('dept-rank').innerText = `RANK #${rank}`;
  document.getElementById('dept-score').innerText = rankedDepts.find(d => d.name === deptName).score;
  
  const deptData = rawData.filter(d => d.Departemen === deptName);
  
  renderTableData(deptData, 'Nama Problem', 'top-problems');
  renderTableData(deptData, 'Nama Solve', 'top-pics');
  renderCriticalTickets(deptData);
}

function renderTableData(data, groupByField, elementId) {
  // Grouping Data
  const grouped = {};
  data.forEach(row => {
    const key = row[groupByField] || 'Unassigned';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(row);
  });
  
  // Mapping ke Array & Kalkulasi Score
  let resultArr = Object.keys(grouped).map(key => {
    return { name: key, ...calculateMetrics(grouped[key]) };
  });
  
  // Urutkan dari problem/tiket terbanyak
  resultArr.sort((a, b) => b.count - a.count);
  
  const tbody = document.getElementById(elementId);
  tbody.innerHTML = resultArr.map(item => `
    <tr class="hover:bg-slate-50">
      <td class="p-3 font-semibold text-slate-700 truncate max-w-[200px]" title="${item.name}">
        ${item.name} <span class="text-[9px] text-indigo-500 ml-1">(${item.count})</span>
      </td>
      <td class="p-3 text-slate-500">${item.closedRaw}</td>
      <td class="p-3 text-slate-500">${item.slaRaw}</td>
      <td class="p-3 text-slate-500">${item.puasRaw}</td>
      <td class="p-3 font-black text-indigo-600">${item.score}</td>
    </tr>
  `).join('');
}

function renderCriticalTickets(data) {
  // Ambil yang status belum Closed
  let unclosed = data.filter(d => d.Status !== 'Closed');
  
  // Identifikasi Kritis & Mendekati
  unclosed = unclosed.map(d => {
    const umur = parseFloat(d['Umur Problem']) || 0;
    const target = parseFloat(d['Target Hari']) || 0;
    
    let statusKondisi = '';
    let isCritical = false;
    
    if (umur > target) {
      statusKondisi = 'MELEBIHI TARGET';
      isCritical = true;
    } else if (umur >= target - 1) {
      statusKondisi = 'MENDEKATI TARGET';
    } else {
      statusKondisi = 'AMAN';
    }
    
    return { ...d, umur, target, statusKondisi, isCritical };
  });
  
  // Filter hanya yang Melebihi & Mendekati, lalu urutkan
  const criticalData = unclosed.filter(d => d.statusKondisi !== 'AMAN')
                               .sort((a, b) => (b.umur - b.target) - (a.umur - a.target));

  const tbody = document.getElementById('critical-tickets');
  if (criticalData.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-slate-400 italic font-bold">Tidak ada tiket kritis. Kinerja sangat baik!</td></tr>`;
    return;
  }
  
  tbody.innerHTML = criticalData.map(d => `
    <tr class="${d.isCritical ? 'bg-red-50/50' : 'bg-amber-50/50'} border-b border-white hover:bg-slate-100 transition-colors">
      <td class="p-3 font-mono font-bold text-slate-700">${d['No Problem']}</td>
      <td class="p-3 text-slate-600 truncate max-w-[150px]" title="${d['Nama Problem']}">${d['Nama Problem']}</td>
      <td class="p-3 text-slate-600">${d['Nama Solve']}</td>
      <td class="p-3 text-center font-bold text-slate-700">${d.umur} <span class="text-[10px] text-slate-400 font-normal">/ ${d.target} Hari</span></td>
      <td class="p-3">
        <span class="px-2 py-1 rounded text-[9px] font-black uppercase ${d.isCritical ? 'bg-red-200 text-red-700' : 'bg-amber-200 text-amber-700'}">
          ${d.statusKondisi}
        </span>
      </td>
    </tr>
  `).join('');
}

document.addEventListener('DOMContentLoaded', init);
