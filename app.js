document.addEventListener('DOMContentLoaded', fetchData);

let globalData = [];

function fetchData() {
  google.script.run
    .withSuccessHandler(data => {
      globalData = data;
      document.getElementById('loading').classList.add('hidden');
      renderDashboard(data);
    })
    .getAhoData();
}

function renderDashboard(data) {
  // Hitung Metrik
  const total = data.length;
  const closed = data.filter(d => d.Status === 'Closed').length;
  const avgSla = (data.reduce((a, b) => a + (parseFloat(b.ACH_SLA) || 0), 0) / total).toFixed(1);
  const totalLeadTime = data.reduce((a, b) => a + (parseFloat(b.Waktu_Penyelesaian) || 0), 0);
  const avgLeadTime = (totalLeadTime / total).toFixed(0);

  // Update Kartu Statistik
  const stats = [
    { label: 'Total Tiket', value: total, icon: 'fa-ticket', color: 'bg-blue-500' },
    { label: 'SLA Average', value: avgSla + '%', icon: 'fa-percent', color: 'bg-emerald-500' },
    { label: 'Tickets Closed', value: closed, icon: 'fa-circle-check', color: 'bg-indigo-500' },
    { label: 'Avg Lead Time', value: avgLeadTime + ' m', icon: 'fa-hourglass-half', color: 'bg-orange-500' }
  ];

  document.getElementById('stats-grid').innerHTML = stats.map(s => `
    <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 card-gradient flex items-center">
      <div class="${s.color} text-white p-4 rounded-xl shadow-lg mr-4">
        <i class="fa-solid ${s.icon} fa-lg"></i>
      </div>
      <div>
        <p class="text-sm font-medium text-slate-500 uppercase tracking-wide">${s.label}</p>
        <h2 class="text-2xl font-bold text-slate-800">${s.value}</h2>
      </div>
    </div>
  `).join('');

  renderCharts(data);
  renderTable(data);
}

function renderCharts(data) {
  // Chart 1: SLA Trend (Top 10 Data Terakhir)
  const ctxSla = document.getElementById('slaChart').getContext('2d');
  new Chart(ctxSla, {
    type: 'bar',
    data: {
      labels: data.slice(0, 7).map(d => d.No_Problem.substring(7)),
      datasets: [{
        label: 'Ach SLA (%)',
        data: data.slice(0, 7).map(d => d.ACH_SLA),
        backgroundColor: 'rgba(79, 70, 229, 0.8)',
        borderRadius: 8
      }]
    },
    options: { responsive: true, plugins: { legend: { display: false } } }
  });

  // Chart 2: Top Problem
  const problemCounts = {};
  data.forEach(d => problemCounts[d.Nama_Problem] = (problemCounts[d.Nama_Problem] || 0) + 1);
  const sorted = Object.entries(problemCounts).sort((a,b) => b[1]-a[1]).slice(0, 5);

  const ctxCat = document.getElementById('categoryChart').getContext('2d');
  new Chart(ctxCat, {
    type: 'doughnut',
    data: {
      labels: sorted.map(i => i[0]),
      datasets: [{
        data: sorted.map(i => i[1]),
        backgroundColor: ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']
      }]
    },
    options: { cutout: '70%', plugins: { legend: { position: 'bottom' } } }
  });
}

function renderTable(data) {
  const tbody = document.querySelector('#mainTable tbody');
  tbody.innerHTML = data.slice(0, 10).map(row => `
    <tr class="hover:bg-slate-50 transition-colors">
      <td class="px-6 py-4 font-semibold text-slate-700">${row.Nama_Toko}</td>
      <td class="px-6 py-4">
        <div class="font-medium text-slate-800">${row.Nama_Problem}</div>
        <div class="text-xs text-slate-400">${row.No_Problem}</div>
      </td>
      <td class="px-6 py-4 text-center font-mono text-indigo-600 font-bold">${row.Waktu_Penyelesaian || 0}</td>
      <td class="px-6 py-4">
        <span class="status-pill ${row.Status === 'Closed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}">
          ${row.Status}
        </span>
      </td>
      <td class="px-6 py-4">
        <div class="w-full bg-slate-100 rounded-full h-2 w-24">
          <div class="bg-indigo-600 h-2 rounded-full" style="width: ${row.ACH_SLA}%"></div>
        </div>
        <span class="text-[10px] font-bold text-slate-500">${row.ACH_SLA}%</span>
      </td>
    </tr>
  `).join('');
}

// Fitur Search
document.getElementById('tableSearch').addEventListener('input', (e) => {
  const term = e.target.value.toLowerCase();
  const filtered = globalData.filter(d => 
    d.Nama_Toko.toLowerCase().includes(term) || 
    d.Nama_Problem.toLowerCase().includes(term)
  );
  renderTable(filtered);
});
