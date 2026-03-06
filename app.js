const API_URL = "https://script.google.com/macros/s/AKfycbx88ftcwoGdcIehAYeywTLyeeO1HxwQSxnGBOFA_qHowXNoLhfz_ELVsvOjC7iBkbE/exec; 

let rawData = [];
let rankedDepts = [];

// ==========================================
// RUMUS PERHITUNGAN (TIDAK BERUBAH)
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
  if (records.length === 0) return { closedRaw: '0%', slaRaw: 0, puasRaw: 0, score: 0, count: 0 };
  const total = records.length;
  const closedCount = records.filter(r => r.Status === 'Closed').length;
  const closedPerc = (closedCount / total) * 100;
  const avgSla = records.reduce((sum, r) => sum + (parseFloat(r['ACH SLA']) || 0), 0) / total;
  const avgPuas = records.reduce((sum, r) => sum + (parseFloat(r['Tingkat Kepuasan']) || 0), 0) / total;
  
  const finalScore = (convertScale(closedPerc, 'closed') * 0.3) + 
                     (convertScale(avgSla, 'sla') * 0.4) + 
                     (convertScale(avgPuas, 'puas') * 0.2);
  
  return { closedRaw: closedPerc.toFixed(1) + '%', slaRaw: avgSla.toFixed(1), puasRaw: avgPuas.toFixed(1), score: finalScore.toFixed(2), count: total };
}

// ==========================================
// FITUR BARU: SEARCH LOGIC
// ==========================================
function filterTable(inputId, tableBodyId) {
  const input = document.getElementById(inputId);
  const filter = input.value.toUpperCase();
  const tbody = document.getElementById(tableBodyId);
  const tr = tbody.getElementsByTagName("tr");

  for (let i = 0; i < tr.length; i++) {
    let visible = false;
    let td = tr[i].getElementsByTagName("td");
    for (let j = 0; j < td.length; j++) {
      if (td[j] && td[j].innerText.toUpperCase().indexOf(filter) > -1) {
        visible = true;
        break;
      }
    }
    tr[i].style.display = visible ? "" : "none";
  }
}

// ==========================================
// FITUR BARU: OVERVIEW LOGIC
// ==========================================
function renderOverview() {
  document.getElementById('overview-view').classList.remove('hidden');
  document.getElementById('detail-view').classList.add('hidden');
  
  // Hitung Total Seluruh Dept
  const globalMetrics = calculateMetrics(rawData);
  const statsEl = document.getElementById('global-stats');
  statsEl.innerHTML = `
    <div class="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
      <p class="text-[10px] font-bold text-slate-400 uppercase">Total Ticket</p>
      <p class="text-2xl font-black text-slate-800">${globalMetrics.count}</p>
    </div>
    <div class="bg-white p-6 rounded-xl shadow-sm border border-slate-200 border-l-4 border-l-emerald-500">
      <p class="text-[10px] font-bold text-slate-400 uppercase">Avg Closed</p>
      <p class="text-2xl font-black text-emerald-600">${globalMetrics.closedRaw}</p>
    </div>
    <div class="bg-white p-6 rounded-xl shadow-sm border border-slate-200 border-l-4 border-l-blue-500">
      <p class="text-[10px] font-bold text-slate-400 uppercase">Avg SLA</p>
      <p class="text-2xl font-black text-blue-600">${globalMetrics.slaRaw}</p>
    </div>
    <div class="bg-indigo-600 p-6 rounded-xl shadow-md text-white">
      <p class="text-[10px] font-bold opacity-80 uppercase">Global Score</p>
      <p class="text-2xl font-black italic">${globalMetrics.score}</p>
    </div>
  `;

  // Bar Comparison
  const barEl = document.getElementById('dept-comparison-bar');
  barEl.innerHTML = rankedDepts.map(d => `
    <div class="group">
      <div class="flex justify-between text-xs mb-1">
        <span class="font-bold text-slate-600 uppercase italic">${d.name}</span>
        <span class="font-black text-indigo-600">${d.score}</span>
      </div>
      <div class="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
        <div class="bg-indigo-500 h-full transition-all duration-1000" style="width: ${(d.score/4)*100}%"></div>
      </div>
    </div>
  `).join('');
}

function showOverview() {
  renderOverview();
  document.querySelectorAll('.dept-item').forEach(e => e.classList.remove('active-dept'));
}

// ==========================================
// LOGIKA SEBELUMNYA (DIPERBARUI UNTUK NAVIGASI)
// ==========================================
async function fetchDatabase() {
  try {
    const response = await fetch(API_URL);
    rawData = await response.json();
    processDepartments();
    renderOverview(); // Munculkan overview pertama kali
  } catch (error) {
    console.error(error);
  }
}

function processDepartments() {
  const uniqueDepts = [...new Set(rawData.map(d => d.Departemen).filter(n => n && String(n).trim() !== ''))];
  rankedDepts = uniqueDepts.map(name => {
    const data = rawData.filter(d => d.Departemen === name);
    return { name, ...calculateMetrics(data) };
  }).sort((a, b) => b.score - a.score);

  document.getElementById('dept-list').innerHTML = rankedDepts.map((d, i) => `
    <div onclick="selectDept('${d.name.replace(/'/g, "\\'")}', this, ${i + 1})" 
         class="dept-item cursor-pointer p-4 rounded-lg hover:bg-slate-50 border-l-4 border-transparent transition-all mb-1 bg-white border border-slate-100 shadow-sm">
      <div class="flex justify-between items-center mb-1">
        <span class="text-[10px] font-black text-slate-400 uppercase">Rank #${i + 1}</span>
        <span class="text-xs font-black bg-indigo-50 text-indigo-700 px-2 py-1 rounded">${d.score}</span>
      </div>
      <h3 class="text-sm font-bold text-slate-700 uppercase italic truncate">${d.name}</h3>
    </div>
  `).join('');
}

function selectDept(deptName, el, rank) {
  document.querySelectorAll('.dept-item').forEach(e => e.classList.remove('active-dept'));
  el.classList.add('active-dept');
  document.getElementById('overview-view').classList.add('hidden');
  document.getElementById('detail-view').classList.remove('hidden');
  
  // Reset Search Inputs
  document.getElementById('search-problem').value = '';
  document.getElementById('search-pic').value = '';
  document.getElementById('search-warning').value = '';

  document.getElementById('dept-name').innerText = deptName;
  document.getElementById('dept-rank').innerText = `RANK #${rank}`;
  const deptData = rawData.filter(d => d.Departemen === deptName);
  const metrics = calculateMetrics(deptData);
  document.getElementById('dept-score').innerText = metrics.score;

  renderGroupedTable(deptData, 'Nama Problem', 'top-problems');
  renderGroupedTable(deptData, 'Nama Solve', 'top-pics');
  renderCriticalTickets(deptData);
}

// Fungsi renderGroupedTable & renderCriticalTickets tetap sama seperti kode sebelumnya Anda...
// (Pastikan fungsi tersebut ada di app.js Anda agar tabel detail terisi)

document.addEventListener('DOMContentLoaded', fetchDatabase);
