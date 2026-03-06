let allData = [];
// URL API Web App Anda
const API_URL = "https://script.google.com/macros/s/AKfycbxr5am6ev_L3XvMebnySiTa9Ypl0h2fTqBIX1hSden62_mvYDchN_PcrSPD4jKiqN5D/exec";

document.addEventListener('DOMContentLoaded', () => {
  fetchData();
});

async function fetchData() {
  try {
    // Menambahkan indikator loading ke sidebar
    document.getElementById('dept-list').innerHTML = '<div class="p-4 text-center text-gray-500 animate-pulse">Menghubungkan ke API...</div>';
    
    const response = await fetch(API_URL);
    if (!response.ok) throw new Error('Gagal mengambil data dari API');
    
    allData = await response.json();
    renderSidebar();
  } catch (error) {
    console.error("Error:", error);
    document.getElementById('dept-list').innerHTML = '<div class="p-4 text-red-500 text-sm">Gagal memuat data. Periksa koneksi API.</div>';
  }
}

function renderSidebar() {
  // Mengambil daftar departemen unik dari data
  const depts = [...new Set(allData.map(d => d.Departemen))].filter(n => n);
  const container = document.getElementById('dept-list');
  
  container.innerHTML = depts.map(d => `
    <div onclick="showDetail('${d.replace(/'/g, "\\'")}')" class="p-4 cursor-pointer hover:bg-gray-50 border-b border-gray-50 transition-all">
      <h4 class="font-bold text-gray-700">${d}</h4>
    </div>
  `).join('');
}

function showDetail(deptName) {
  document.getElementById('dept-name').innerText = deptName;
  document.getElementById('detail-view').classList.remove('hidden');
  
  const deptData = allData.filter(d => d.Departemen === deptName);
  
  // 1. Bar Chart Masalah
  const probCounts = {};
  deptData.forEach(d => {
    const prob = d['Nama Problem'];
    if(prob) probCounts[prob] = (probCounts[prob] || 0) + 1;
  });
  
  const topProbs = Object.entries(probCounts).sort((a,b) => b[1]-a[1]).slice(0,5);
  
  document.getElementById('problem-bars').innerHTML = topProbs.length > 0 ? topProbs.map(p => `
    <div class="text-xs font-bold mb-1">${p[0]} (${p[1]} case)</div>
    <div class="bg-gray-200 h-2 rounded mb-3"><div class="bg-indigo-600 h-full rounded" style="width:${(p[1]/topProbs[0][1])*100}%"></div></div>
  `).join('') : '<p class="text-xs text-gray-400">Tidak ada data masalah.</p>';

  // 2. Tabel SLA Minus (Status: New, Progress, Solved)
  const unclosed = deptData.filter(d => d.Status !== 'Closed');
  document.getElementById('table-body').innerHTML = unclosed.length > 0 ? unclosed.map(d => `
    <tr class="${d['Umur Problem'] > d['Target Hari'] ? 'critical' : ''} border-b">
      <td class="p-2 font-mono text-xs">${d['No Problem']}</td>
      <td class="p-2 text-xs">${d.Status}</td>
      <td class="p-2 text-right text-xs">${d['Target Hari']}</td>
    </tr>
  `).join('') : '<tr><td colspan="3" class="p-4 text-center text-gray-400 text-xs">Semua tiket closed.</td></tr>';
}
