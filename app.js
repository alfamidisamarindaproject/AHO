const API_URL = "https://script.google.com/macros/s/AKfycbyKgLwEWiFaw2uGQjR_U-u1bht9ZPTWmNSYgSUuZkvUTQrR_Ona84sp4MloWTfLq66C/exec";

async function init() {
  const res = await fetch(API_URL);
  const data = await res.json();
  
  // Render Sidebar dari Sheet Dept
  const nav = document.getElementById('dept-list');
  data.dept.forEach(d => {
    nav.innerHTML += `<button onclick="render('${d.Departement}')" class="w-full text-left p-3 hover:bg-indigo-50 rounded-lg font-medium">${d.Departement}</button>`;
  });
  
  window.fullData = data.tarikan;
}

function render(dept) {
  const filtered = window.fullData.filter(d => d.Departemen === dept);
  
  // 1. Update Statistik
  document.getElementById('stats-grid').innerHTML = `
    <div class="bg-blue-600 text-white p-4 rounded-xl">Total: ${filtered.length} Case</div>
    <div class="bg-emerald-600 text-white p-4 rounded-xl">Closed: ${filtered.filter(d=>d.Status==='Closed').length}</div>
    <div class="bg-amber-600 text-white p-4 rounded-xl">SLA Avg: 98%</div>
  `;
  
  // 2. Render Tabel SLA Kritis
  const tbody = document.getElementById('sla-table');
  tbody.innerHTML = filtered.filter(d => d.Status !== 'Closed').map(d => `
    <tr class="border-b">
      <td class="p-2 font-bold">${d['No Problem']}</td>
      <td class="p-2">${d['Nama Problem']}</td>
      <td class="p-2 text-red-500 font-bold">${d['Umur Problem']} Hr</td>
    </tr>
  `).join('');
}

document.addEventListener('DOMContentLoaded', init);
