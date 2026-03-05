// GANTI URL INI dengan URL Web App yang Anda dapatkan saat Deploy di Google Apps Script
const API_URL = "URL_WEB_APP_ANDA_DISINI";

document.addEventListener('DOMContentLoaded', () => {
    fetchData();
});

async function fetchData() {
    try {
        const response = await fetch(API_URL);
        const data = await response.json();
        
        document.getElementById('loader').classList.add('hidden');
        processAndRender(data);
    } catch (error) {
        console.error("Error fetching data:", error);
        document.getElementById('loader').innerHTML = "Gagal memuat data. Periksa URL API.";
    }
}

function processAndRender(data) {
    // 1. Grouping & Score Calculation for Departments
    const deptMap = {};

    data.forEach(item => {
        const dName = item.Departemen || "N/A";
        const slaVal = parseFloat(item.ACH_SLA) || 0;

        if (!deptMap[dName]) {
            deptMap[dName] = { name: dName, totalSla: 0, count: 0 };
        }
        deptMap[dName].totalSla += slaVal;
        deptMap[dName].count += 1;
    });

    // Urutkan dari Score Tertinggi ke Rendah
    const sortedDepts = Object.values(deptMap)
        .map(d => ({
            name: d.name,
            score: (d.totalSla / d.count).toFixed(2)
        }))
        .sort((a, b) => b.score - a.score);

    // 2. Render Ranking Cards (Top 13 atau semua)
    const grid = document.getElementById('dept-grid');
    grid.innerHTML = sortedDepts.slice(0, 13).map((dept, index) => `
        <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all">
            <div class="flex justify-between items-center mb-2">
                <span class="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-bold">RANK #${index + 1}</span>
                <i class="fas fa-shield-halved ${index < 3 ? 'text-amber-500' : 'text-slate-300'}"></i>
            </div>
            <h4 class="font-bold text-slate-800 truncate" title="${dept.name}">${dept.name}</h4>
            <div class="mt-3 flex items-end justify-between">
                <span class="text-2xl font-black text-indigo-600">${dept.score}%</span>
                <span class="text-[10px] text-slate-400">Avg SLA</span>
            </div>
            <div class="w-full bg-slate-100 h-1.5 rounded-full mt-2">
                <div class="bg-indigo-500 h-1.5 rounded-full" style="width: ${dept.score}%"></div>
            </div>
        </div>
    `).join('');

    // 3. Render Table
    const tbody = document.querySelector('#main-table tbody');
    tbody.innerHTML = data.slice(0, 20).map(row => `
        <tr class="hover:bg-slate-50 transition-colors">
            <td class="px-6 py-4 font-bold text-slate-700">${row.Departemen}</td>
            <td class="px-6 py-4 text-slate-600">${row.Nama_Toko}</td>
            <td class="px-6 py-4 text-slate-500">${row.Nama_Problem}</td>
            <td class="px-6 py-4 text-center">
                <span class="font-mono font-bold ${row.ACH_SLA >= 100 ? 'text-emerald-600' : 'text-red-500'}">
                    ${row.ACH_SLA}%
                </span>
            </td>
        </tr>
    `).join('');
}
