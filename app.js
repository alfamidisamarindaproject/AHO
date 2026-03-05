// GANTI DENGAN URL WEB APP ANDA
const API_URL = "https://script.google.com/macros/s/AKfycbwy7orzjb0kN6JZsTcEm698Mxj4FP2a2p9BOy2JsnEZ2_jG8sycaoQSWSVVJKJW2Iaq/exec"; 

let dataTarikan = [];
let dataMasterDept = [];

document.addEventListener('DOMContentLoaded', fetchData);

async function fetchData() {
    try {
        const response = await fetch(API_URL);
        const result = await response.json();
        
        if(result.error) throw new Error(result.error);

        dataTarikan = result.tarikan;
        dataMasterDept = result.masterDept;
        
        document.getElementById('side-loader').classList.add('hidden');
        renderSidebar();
    } catch (e) {
        console.error("Fetch Error:", e);
        document.getElementById('side-loader').innerHTML = `
            <i class="fas fa-exclamation-circle text-red-500 fa-2xl mb-2"></i>
            <p class="text-red-500 text-[10px] font-bold uppercase">Gagal Load Data</p>
        `;
    }
}

function calculateScore(deptName) {
    // Cari data di Tarikan yang cocok dengan Nama Divisi atau Departemen
    const records = dataTarikan.filter(d => 
        (d.Nama_Divisi && d.Nama_Divisi.toUpperCase() === deptName.toUpperCase()) || 
        (d.Departemen && d.Departemen.toUpperCase() === deptName.toUpperCase())
    );

    const total = records.length;
    if (total === 0) return { score: "0.00", percClosed: 0, sla: 0, total: 0 };

    // 1. % Closed (Konversi ke skala 4)
    const closedCount = records.filter(x => x.Status === 'Closed').length;
    const closedScore = (closedCount / total) * 4;

    // 2. ACH SLA (Konversi ke skala 4)
    const avgSla = records.reduce((a, b) => a + (parseFloat(b.ACH_SLA) || 0), 0) / total;
    const slaScore = (avgSla / 100) * 4;

    // 3. Tingkat Kepuasan (Sudah skala 1-4)
    const avgPuas = records.reduce((a, b) => a + (parseFloat(b.Tingkat_Kepuasan) || 0), 0) / total;

    const finalScore = ((closedScore + slaScore + (avgPuas || 0)) / 3).toFixed(2);

    return { 
        score: finalScore, 
        total, 
        percClosed: ((closedCount/total)*100).toFixed(0),
        sla: avgSla.toFixed(0)
    };
}

function renderSidebar() {
    const container = document.getElementById('dept-list');
    
    // Perhatikan: Nama kolom di file Anda adalah "Departement" (pakai 'e')
    const deptScores = dataMasterDept.map(d => {
        const name = d.Departement || d.DEPARTEMENT; 
        const stats = calculateScore(name);
        return { name, ...stats };
    }).sort((a, b) => b.score - a.score);

    container.innerHTML = deptScores.map((s, i) => `
        <div onclick="showDetail(this, '${s.name.replace(/'/g, "\\'")}', ${i+1})" 
             class="p-4 rounded-xl cursor-pointer hover:bg-slate-50 transition-all border border-transparent group mb-1">
            <div class="flex justify-between items-center mb-1">
                <span class="text-[9px] font-black text-slate-400 group-hover:text-indigo-600 uppercase">Rank #${i+1}</span>
                <span class="text-xs font-black bg-slate-100 text-indigo-700 px-2 py-0.5 rounded">${s.score}</span>
            </div>
            <h4 class="text-sm font-bold text-slate-700 truncate uppercase italic">${s.name}</h4>
            <div class="flex gap-3 mt-1 text-[9px] font-bold text-slate-400 uppercase">
                <span>${s.percClosed}% CLSD</span>
                <span>${s.sla}% SLA</span>
            </div>
        </div>
    `).join('');
}

function showDetail(el, deptName, rank) {
    document.querySelectorAll('.p-4').forEach(c => c.classList.remove('active-dept'));
    el.classList.add('active-dept');
    
    document.getElementById('empty-state').classList.add('hidden');
    document.getElementById('detail-view').classList.remove('hidden');

    const deptData = dataTarikan.filter(d => 
        (d.Nama_Divisi && d.Nama_Divisi.toUpperCase() === deptName.toUpperCase()) || 
        (d.Departemen && d.Departemen.toUpperCase() === deptName.toUpperCase())
    );
    const stats = calculateScore(deptName);

    document.getElementById('view-dept-name').innerText = deptName;
    document.getElementById('final-score-val').innerText = stats.score;

    // Masalah Terbanyak
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
                <div class="bg-indigo-600 h-full transition-all duration-1000" style="width: ${(p[1]/max)*100}%"></div>
            </div>
        </div>
    `).join('');

    // Tabel Outstanding & Critical
    const unclosed = deptData.filter(d => d.Status !== 'Closed');
    document.getElementById('unclosed-tbody').innerHTML = unclosed.map(row => {
        const isMinus = parseFloat(row.Umur_Problem) > (parseFloat(row.Target_Hari) || 0);
        return `
            <tr class="${isMinus ? 'critical-row' : ''} border-b border-slate-50">
                <td class="p-3">
                    <div class="font-bold text-slate-700">${row.No_Problem}</div>
                    <div class="text-[9px] text-slate-400 italic truncate w-32">${row.Nama_Problem}</div>
                </td>
                <td class="p-3 text-[9px] font-black uppercase text-slate-500">${row.Status}</td>
                <td class="p-3 text-right font-bold text-slate-400">${row.Target_Hari || 0}</td>
                <td class="p-3 text-right font-black ${isMinus ? 'text-rose-600' : 'text-slate-700'}">${row.Umur_Problem} Hr</td>
            </tr>
        `;
    }).join('');
}
