const API_URL = "https://script.google.com/macros/s/AKfycbx7wOFVCvO-nEz_2-a6GxIuFEBTOfifWn3BSIEBYAxHU_79oZaTWaK_wBkKcHtAvn-g/exec"; // Ganti dengan URL hasil deploy Code.gs

let dataTarikan = [];
let dataMasterDept = [];

document.addEventListener('DOMContentLoaded', fetchData);

async function fetchData() {
    try {
        const response = await fetch(API_URL);
        const result = await response.json();
        dataTarikan = result.tarikan;
        dataMasterDept = result.masterDept;
        renderSidebar();
    } catch (e) {
        console.error("Gagal ambil data", e);
    }
}

function calculateScore(deptName) {
    const records = dataTarikan.filter(d => d.Departemen === deptName);
    const total = records.length;
    if (total === 0) return { score: "0.00", closed: 0, sla: 0, puas: 0, total: 0 };

    // 1. % Closed (Konversi 1-4)
    const closedCount = records.filter(x => x.Status === 'Closed').length;
    const closedScore = (closedCount / total) * 4;

    // 2. ACH SLA (Konversi 1-4)
    const avgSla = records.reduce((a, b) => a + (parseFloat(b.ACH_SLA) || 0), 0) / total;
    const slaScore = (avgSla / 100) * 4;

    // 3. Tingkat Kepuasan (Skala sudah 1-4)
    const avgPuas = records.reduce((a, b) => a + (parseFloat(b.Tingkat_Kepuasan) || 0), 0) / total;

    // Gabungan (Rata-rata)
    const finalScore = ((closedScore + slaScore + avgPuas) / 3).toFixed(2);

    return { 
        score: finalScore, 
        total, 
        percClosed: ((closedCount/total)*100).toFixed(0),
        sla: avgSla.toFixed(0)
    };
}

function renderSidebar() {
    // Mapping 13 Dept dari Sheet Master
    const deptScores = dataMasterDept.map(d => {
        const deptName = d.DEPARTEMENT;
        const stats = calculateScore(deptName);
        return { name: deptName, ...stats };
    }).sort((a, b) => b.score - a.score);

    const container = document.getElementById('dept-list');
    container.innerHTML = deptScores.map((s, i) => `
        <div onclick="showDetail(this, '${s.name}', ${i+1})" class="p-4 rounded-xl cursor-pointer hover:bg-slate-50 transition-all border border-transparent group">
            <div class="flex justify-between items-center mb-1">
                <span class="text-[9px] font-black text-slate-400 group-hover:text-indigo-600 italic">RANK #0${i+1}</span>
                <span class="text-xs font-black bg-slate-900 text-white px-2 py-0.5 rounded">${s.score}</span>
            </div>
            <h4 class="text-sm font-bold text-slate-700 truncate group-hover:text-indigo-900 italic uppercase tracking-tighter">${s.name}</h4>
            <div class="flex gap-3 mt-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                <span><i class="fas fa-check-circle text-emerald-500"></i> ${s.percClosed}%</span>
                <span><i class="fas fa-clock text-indigo-400"></i> ${s.sla}%</span>
            </div>
        </div>
    `).join('');
}

function showDetail(el, deptName, rank) {
    // UI Setup
    document.querySelectorAll('.dept-card').forEach(c => c.classList.remove('active-dept'));
    el.classList.add('active-dept');
    document.getElementById('empty-state').classList.add('hidden');
    document.getElementById('detail-view').classList.remove('hidden');

    const deptData = dataTarikan.filter(d => d.Departemen === deptName);
    const stats = calculateScore(deptName);

    document.getElementById('view-dept-name').innerText = deptName;
    document.getElementById('rank-label').innerText = `RANK #0${rank}`;
    
    // Header Stats
    document.getElementById('summary-score').innerHTML = `
        <div class="bg-indigo-50 p-4 rounded-xl text-center min-w-[100px] border border-indigo-100">
            <p class="text-[9px] font-bold text-indigo-400 uppercase tracking-widest">AHO Score</p>
            <p class="text-2xl font-black text-indigo-700 italic">${stats.score}</p>
        </div>
        <div class="bg-slate-50 p-4 rounded-xl text-center min-w-[100px] border border-slate-100">
            <p class="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Total Case</p>
            <p class="text-2xl font-black text-slate-700 italic">${stats.total}</p>
        </div>
    `;

    // Problem Terbanyak
    const counts = {};
    deptData.forEach(d => counts[d.Nama_Problem] = (counts[d.Nama_Problem] || 0) + 1);
    const sorted = Object.entries(counts).sort((a,b) => b[1]-a[1]).slice(0, 5);
    const max = sorted[0] ? sorted[0][1] : 0;

    document.getElementById('problem-bars').innerHTML = sorted.map(p => `
        <div>
            <div class="flex justify-between text-[10px] font-bold text-slate-500 mb-1 uppercase italic">
                <span class="truncate pr-4">${p[0]}</span>
                <span class="text-indigo-600">${p[1]} CASE</span>
            </div>
            <div class="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                <div class="bg-indigo-600 h-full" style="width: ${(p[1]/max)*100}%"></div>
            </div>
        </div>
    `).join('');

    // Table Unclosed & SLA Minus
    const unclosed = deptData.filter(d => d.Status !== 'Closed');
    document.getElementById('unclosed-tbody').innerHTML = unclosed.map(row => {
        const isMinus = parseFloat(row.Umur_Problem) > (parseFloat(row.Target_Hari) || 0);
        return `
            <tr class="${isMinus ? 'bg-rose-50 animate-pulse' : ''} hover:bg-slate-50 transition-colors">
                <td class="p-4">
                    <div class="font-bold text-slate-700">${row.No_Problem}</div>
                    <div class="text-[9px] text-slate-400 italic truncate w-32">${row.Nama_Problem}</div>
                </td>
                <td class="p-4 font-black text-[10px] uppercase italic text-slate-500">${row.Status}</td>
                <td class="p-4 text-right font-bold text-slate-400">${row.Target_Hari || 0}</td>
                <td class="p-4 text-right font-black ${isMinus ? 'text-rose-600' : 'text-slate-700'}">${row.Umur_Problem} Hr</td>
            </tr>
        `;
    }).join('');
}
