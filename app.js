/**
 * KONFIGURASI: Ganti URL di bawah dengan URL Web App yang Anda dapatkan 
 * setelah melakukan Deploy (New Deployment) di Google Apps Script.
 */
const API_URL = "https://script.google.com/macros/s/AKfycby_e7mxFubDZMttj20F1sYfmU7x3EChoaDKiju5f9YEMQKhEw6ZYKePhonKwOsy73CQ/exec";

let globalData = [];

// Inisialisasi saat halaman dimuat
document.addEventListener('DOMContentLoaded', () => {
    fetchData();
});

async function fetchData() {
    try {
        const response = await fetch(API_URL);
        const data = await response.json();
        globalData = data;
        renderDeptList();
    } catch (error) {
        console.error("Error fetching data:", error);
        document.getElementById('dept-list').innerHTML = `<p class="p-4 text-red-500 text-xs text-center">Gagal memuat data. Periksa API_URL.</p>`;
    }
}

function calculateScore(deptName) {
    const d = globalData.filter(item => item.Departemen === deptName);
    const total = d.length;
    
    // Perhitungan % Closed
    const closedCount = d.filter(x => x.Status === 'Closed').length;
    const percClosed = (closedCount / total) * 100;
    
    // Rata-rata ACH SLA
    const avgSla = d.reduce((a, b) => a + (parseFloat(b.ACH_SLA) || 0), 0) / total;
    
    // Rata-rata Tingkat Kepuasan (Skala 1-4)
    const avgPuas = d.reduce((a, b) => a + (parseFloat(b.Tingkat_Kepuasan) || 0), 0) / total;

    // Konversi Akhir ke Skala 1-4
    // Rumus: (%Closed/25 + %SLA/25 + Kepuasan) / 3
    const finalScore = ((percClosed/25) + (avgSla/25) + avgPuas) / 3;

    return { 
        name: deptName, 
        score: finalScore.toFixed(2), 
        total,
        closedPerc: percClosed.toFixed(0),
        sla: avgSla.toFixed(0)
    };
}

function renderDeptList() {
    const depts = [...new Set(globalData.map(d => d.Departemen))].filter(n => n);
    
    // Hitung dan urutkan 13 Departemen
    const sortedDepts = depts.map(name => calculateScore(name))
        .sort((a, b) => b.score - a.score)
        .slice(0, 13);

    const listContainer = document.getElementById('dept-list');
    listContainer.innerHTML = sortedDepts.map((d, i) => `
        <div onclick="selectDept(this, '${d.name}')" class="dept-item p-5 cursor-pointer border-b border-slate-50 hover:bg-slate-50 transition-all">
            <div class="flex justify-between items-center mb-1">
                <span class="text-[10px] font-bold text-indigo-500 italic uppercase">Rank #${i+1}</span>
                <span class="text-xs font-black bg-indigo-600 text-white px-2 py-0.5 rounded">${d.score}</span>
            </div>
            <h4 class="font-bold text-slate-800 text-sm truncate uppercase">${d.name}</h4>
            <div class="flex gap-4 mt-2 text-[10px] text-slate-400 font-bold uppercase">
                <span><i class="fas fa-check-circle text-emerald-500"></i> ${d.closedPerc}% CLSD</span>
                <span><i class="fas fa-clock text-blue-500"></i> ${d.sla}% SLA</span>
            </div>
        </div>
    `).join('');
}

function selectDept(el, name) {
    // UI Feedback
    document.querySelectorAll('.dept-item').forEach(item => item.classList.remove('active'));
    el.classList.add('active');
    document.getElementById('welcome-screen').classList.add('hidden');
    document.getElementById('detail-content').classList.remove('hidden');

    const deptData = globalData.filter(d => d.Departemen === name);
    const scoreInfo = calculateScore(name);

    // Update Header
    document.getElementById('current-dept-name').innerText = name;
    document.getElementById('summary-badges').innerHTML = `
        <div class="bg-indigo-50 px-4 py-2 rounded-xl text-center">
            <p class="text-[9px] font-bold text-indigo-400 uppercase">Total Tickets</p>
            <p class="text-xl font-black text-indigo-700">${scoreInfo.total}</p>
        </div>
        <div class="bg-emerald-50 px-4 py-2 rounded-xl text-center">
            <p class="text-[9px] font-bold text-emerald-400 uppercase">Final Score</p>
            <p class="text-xl font-black text-emerald-700">${scoreInfo.score}</p>
        </div>
    `;

    // Render Problem Terbanyak
    const counts = {};
    deptData.forEach(d => counts[d.Nama_Problem] = (counts[d.Nama_Problem] || 0) + 1);
    const sortedProbs = Object.entries(counts).sort((a,b) => b[1] - a[1]).slice(0, 5);
    const maxVal = sortedProbs[0][1];

    document.getElementById('top-problem-bars').innerHTML = sortedProbs.map(p => `
        <div>
            <div class="flex justify-between text-[11px] font-bold text-slate-600 mb-1">
                <span class="truncate pr-4 italic uppercase">${p[0]}</span>
                <span>${p[1]}</span>
            </div>
            <div class="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                <div class="bg-indigo-500 h-full" style="width: ${(p[1]/maxVal)*100}%"></div>
            </div>
        </div>
    `).join('');

    // Render Table (SLA Critical & Outstanding)
    // Outstanding = Status New, Progress, Solved
    const outstanding = deptData.filter(d => d.Status !== 'Closed');
    const tableBody = document.getElementById('problem-table-body');
    
    tableBody.innerHTML = outstanding.slice(0, 15).map(row => {
        const target = parseFloat(row.Target_Hari) || 0;
        const umur = parseFloat(row.Umur_Problem) || 0;
        const isMinus = umur > target;

        return `
            <tr class="${isMinus ? 'bg-rose-50 text-rose-900 font-semibold' : ''}">
                <td class="p-3">
                    <div class="font-bold">${row.No_Problem}</div>
                    <div class="text-[10px] opacity-60 truncate w-40">${row.Nama_Problem}</div>
                </td>
                <td class="p-3 text-[10px] font-black uppercase italic">${row.Status}</td>
                <td class="p-3 text-right font-mono">${target}</td>
                <td class="p-3 text-right font-mono font-black ${isMinus ? 'text-rose-600 animate-pulse' : 'text-slate-400'}">
                    ${umur}
                </td>
            </tr>
        `;
    }).join('');
}
