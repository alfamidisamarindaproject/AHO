let rawData = [];
const API_URL = "https://script.google.com/macros/s/AKfycbxoEAv_TCmHeOJzr_Sm4tN0TTyb9QvYLtRTRmomTlnT-7-LjCj4VKQg8YkDj1s1h8jP/exec"; // Gunakan google.script.run jika di dalam Apps Script

document.addEventListener('DOMContentLoaded', () => {
  // Jika di Apps Script gunakan ini:
  google.script.run.withSuccessHandler(init).getAhoData();
});

function init(data) {
  rawData = data;
  renderDeptList();
}

function calculateDeptScore(deptName) {
  const deptData = rawData.filter(d => d.Departemen === deptName);
  const total = deptData.length;
  if (total === 0) return 0;

  // 1. % Closed
  const closedCount = deptData.filter(d => d.Status === 'Closed').length;
  const percClosed = (closedCount / total) * 100;
  
  // 2. Avg SLA
  const avgSla = deptData.reduce((a, b) => a + (parseFloat(b.ACH_SLA) || 0), 0) / total;
  
  // 3. Avg Kepuasan
  const avgPuas = deptData.reduce((a, b) => a + (parseFloat(b.Tingkat_Kepuasan) || 0), 0) / total;

  // Konversi ke Skala 1-4 (Contoh Sederhana)
  const scoreClosed = (percClosed / 25) || 1; 
  const scoreSla = (avgSla / 25) || 1;
  const scorePuas = avgPuas || 1;

  const finalScore = ((scoreClosed + scoreSla + scorePuas) / 3).toFixed(2);
  
  return { 
    name: deptName, 
    finalScore, 
    percClosed: percClosed.toFixed(1), 
    avgSla: avgSla.toFixed(1),
    total
  };
}

function renderDeptList() {
  const deptNames = [...new Set(rawData.map(d => d.Departemen))].slice(0, 13);
  const scores = deptNames.map(name => calculateDeptScore(name)).sort((a,b) => b.finalScore - a.finalScore);

  const container = document.getElementById('dept-list');
  container.innerHTML = scores.map((s, i) => `
    <div onclick="showDetail('${s.name}')" class="dept-item p-5 cursor-pointer border-b border-slate-50 hover:bg-slate-50 transition-all group">
      <div class="flex justify-between items-center">
        <span class="text-[10px] font-bold text-indigo-400 tracking-tighter">#0${i+1}</span>
        <span class="text-[10px] font-bold text-white bg-indigo-600 px-2 py-0.5 rounded-full">${s.finalScore}</span>
      </div>
      <h4 class="font-bold text-slate-700 mt-1 group-hover:text-indigo-600 truncate">${s.name}</h4>
      <div class="flex gap-3 mt-2 text-[10px] text-slate-400 font-medium">
        <span><i class="fas fa-check-circle text-emerald-400"></i> ${s.percClosed}%</span>
        <span><i class="fas fa-clock text-blue-400"></i> ${s.avgSla}%</span>
      </div>
    </div>
  `).join('');
}

function showDetail(deptName) {
  document.getElementById('empty-state').classList.add('hidden');
  document.getElementById('detail-header').classList.remove('hidden');
  document.getElementById('detail-content').classList.remove('hidden');
  document.getElementById('selected-dept-name').innerText = deptName;

  const deptData = rawData.filter(d => d.Departemen === deptName);
  
  // Highlighting Problem Terbanyak
  const probCounts = {};
  deptData.forEach(d => probCounts[d.Nama_Problem] = (probCounts[d.Nama_Problem] || 0) + 1);
  const sortedProbs = Object.entries(probCounts).sort((a,b) => b[1] - a[1]).slice(0, 5);

  const probContainer = document.getElementById('top-problems-list');
  const maxCount = sortedProbs[0][1];
  probContainer.innerHTML = sortedProbs.map(p => `
    <div>
      <div class="flex justify-between text-xs mb-1">
        <span class="font-semibold text-slate-600">${p[0]}</span>
        <span class="font-bold text-indigo-600">${p[1]} Masalah</span>
      </div>
      <div class="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
        <div class="bg-indigo-500 h-full" style="width: ${(p[1]/maxCount)*100}%"></div>
      </div>
    </div>
  `).join('');

  // Table Unclosed & SLA Minus (Umur Problem > Target)
  const unclosed = deptData.filter(d => d.Status !== 'Closed');
  const tbody = document.querySelector('#unclosed-table tbody');
  
  tbody.innerHTML = unclosed.map(row => {
    const isMinus = (parseFloat(row.Umur_Problem) > parseFloat(row.Target_Hari));
    return `
      <tr class="${isMinus ? 'bg-rose-50' : ''} hover:bg-slate-50 transition-colors">
        <td class="px-4 py-3 font-mono text-xs">${row.No_Problem}</td>
        <td class="px-4 py-3">${row.Nama_Toko}</td>
        <td class="px-4 py-3">
          <span class="text-[10px] font-bold px-2 py-1 rounded bg-slate-200">${row.Status}</span>
        </td>
        <td class="px-4 py-3 text-right font-medium">${row.Target_Hari || 0}</td>
        <td class="px-4 py-3 text-right font-bold ${isMinus ? 'text-rose-600' : 'text-slate-400'}">
          ${row.Umur_Problem || 0} Hr
          ${isMinus ? '<i class="fas fa-arrow-up text-[10px] ml-1"></i>' : ''}
        </td>
      </tr>
    `;
  }).join('');
}
