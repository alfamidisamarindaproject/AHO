let allData = [];
const API_URL = "https://script.google.com/macros/s/AKfycbzMSZ4iMywUiPTZGjoiMczkviWl9qKTvZowhlTT0wMSD8JY65N49y3KkwATgScrgq8_/exec";

// Fungsi Konversi Interval 1-4
function calcValue(val, type) {
  if (type === 'closed') {
    if (val < 85) return 1;
    if (val >= 100) return 4;
    return 1 + ((val - 85) / 15) * 3;
  }
  if (type === 'sla') {
    if (val < 85) return 1;
    if (val > 130) return 4;
    return 1 + ((val - 85) / 45) * 3;
  }
  // Kepuasan
  return val < 4 ? 1 + ((val - 1) / 3) * 3 : 4;
}

function calculateDeptScore(data) {
  if (data.length === 0) return 0;
  const total = data.length;
  const closed = (data.filter(d => d.Status === 'Closed').length / total) * 100;
  const sla = data.reduce((a, b) => a + (parseFloat(b['ACH SLA']) || 0), 0) / total;
  const puas = data.reduce((a, b) => a + (parseFloat(b['Tingkat Kepuasan']) || 0), 0) / total;
  
  const score = (calcValue(closed, 'closed') * 0.3) + 
                (calcValue(sla, 'sla') * 0.4) + 
                (calcValue(puas, 'kepuasan') * 0.2);
  return score.toFixed(2);
}

// Fungsi utama loading menggunakan Fetch API
async function init() {
  try {
    const response = await fetch(API_URL);
    allData = await response.json();
    
    // Filter 13 Departemen Unik
    const depts = [...new Set(allData.map(d => d.Departemen))].filter(n => n);
    
    document.getElementById('dept-list').innerHTML = depts.map(d => 
      `<button onclick="renderDetail('${d}')" class="w-full text-left p-2 hover:bg-indigo-100 rounded transition font-medium text-sm border-b">
        ${d}
      </button>`
    ).join('');
  } catch (err) {
    console.error("Gagal memuat data:", err);
    alert("Gagal terhubung ke API. Pastikan Deployment Apps Script sudah 'Anyone'.");
  }
}

function renderDetail(dept) {
  const filtered = allData.filter(d => d.Departemen === dept);
  document.getElementById('content').classList.remove('hidden');
  document.getElementById('dept-name').innerText = dept;
  
  const score = calculateDeptScore(filtered);
  
  // Contoh Render ke UI
  document.getElementById('score-cards').innerHTML = `
    <div class="bg-indigo-600 text-white p-4 rounded-lg shadow">
      <p class="text-xs opacity-75">Score Layanan</p>
      <p class="text-2xl font-bold">${score}</p>
    </div>
  `;
}

document.addEventListener('DOMContentLoaded', init);
