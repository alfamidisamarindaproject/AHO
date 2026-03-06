const API_URL = "https://script.google.com/macros/s/AKfycbxr5am6ev_L3XvMebnySiTa9Ypl0h2fTqBIX1hSden62_mvYDchN_PcrSPD4jKiqN5D/exec";

async function loadDashboard() {
  try {
    const res = await fetch(API_URL);
    const data = await res.json();
    
    // Render Sidebar (mengambil dari sheet Dept)
    const list = document.getElementById('dept-list');
    list.innerHTML = data.dept.map(d => 
      `<button onclick="render('${d.Departement}')" class="w-full p-2 text-left hover:bg-indigo-100 rounded">${d.Departement}</button>`
    ).join('');
    
    window.allData = data.tarikan;
  } catch(e) {
    document.getElementById('sidebar').innerHTML = "Gagal memuat API. Pastikan Deployment 'Anyone'.";
  }
}

function render(dept) {
  document.getElementById('dashboard-content').classList.remove('hidden');
  document.getElementById('dept-title').innerText = dept;
  
  const filtered = window.allData.filter(d => d.Departemen === dept);
  
  // Render Tabel
  document.getElementById('table-body').innerHTML = filtered.map(d => `
    <tr class="border-b ${d['Umur Problem'] > d['Target Hari'] ? 'bg-red-50' : ''}">
      <td class="p-2">${d['No Problem']}</td>
      <td class="p-2">${d.Status}</td>
      <td class="p-2 text-red-500 font-bold">${d['Target Hari'] || 0}</td>
    </tr>
  `).join('');
}

document.addEventListener('DOMContentLoaded', loadDashboard);
