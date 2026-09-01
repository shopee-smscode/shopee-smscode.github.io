// ==========================================
// KONFIGURASI FIREBASE CATATANKU
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyD8oux4DDAE8xB5EaQpnlhosUkK3HVlWL0",
    authDomain: "catatanku-app-ce60b.firebaseapp.com",
    databaseURL: "https://catatanku-app-ce60b-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "catatanku-app-ce60b",
    storageBucket: "catatanku-app-ce60b.firebasestorage.app",
    messagingSenderId: "291744292263",
    appId: "1:291744292263:web:ab8d32ba52bc19cbffea82"
};

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const DB_PATH = 'notes/public';

// DOM & State
const viewList = document.getElementById('viewList');
const viewForm = document.getElementById('viewForm');
const viewDetail = document.getElementById('viewDetail');

let selectedNoteKey = null;
let currentNoteData = null;
let isEditingNote = false;
let currentNoteRawContent = "";
let currentColor = 'white';

// State Hapus Detail
let deletePending = false;
let deleteTimer = null;

// State Hapus Cepat (FAB)
let allNotesData = []; 
let quickDeletePending = false;
let quickDeleteTimer = null;
let quickDeleteTargetKey = null; // Pengunci ID target agar hapus 100% akurat

const colorStyles = {
    'white': { bg: '#ffffff', border: 'transparent', square: '#ffffff' },
    'red': { bg: '#ffe6e6', border: '#ff3b30', square: '#ff3b30' },
    'orange': { bg: '#fff0e6', border: '#ff9500', square: '#ff9500' },
    'yellow': { bg: '#fffbe6', border: '#ffcc00', square: '#ffcc00' },
    'green': { bg: '#e6f9e6', border: '#4cd964', square: '#4cd964' },
    'blue': { bg: '#e6f0ff', border: '#2196f3', square: '#2196f3' },
    'purple': { bg: '#f0e6ff', border: '#af52de', square: '#af52de' }
};

// ==========================================
// INISIALISASI & RENDER LIST
// ==========================================
function initNotesSync() {
    const grid = document.getElementById('notes-grid');
    db.ref(DB_PATH).orderByChild('timestamp').on('value', snapshot => {
        grid.innerHTML = ''; let items = [];
        snapshot.forEach(child => { items.push({ key: child.key, ...child.val() }); });
        
        document.getElementById('notesCount').innerText = `(${items.length})`;
        allNotesData = items.reverse(); // Index 0 = Terbaru, Index Terakhir = Terlama
        
        if(allNotesData.length === 0) { grid.innerHTML = '<div style="text-align:center; color:#9e9e9e; padding: 20px;">Belum ada catatan.</div>'; return; }
        
        allNotesData.forEach((d) => {
            const card = document.createElement('div'); 
            card.className = 'note-card'; 
            
            let cTheme = colorStyles[d.color || 'white'];
            card.style.backgroundColor = cTheme.bg;
            card.style.borderLeft = `5px solid ${cTheme.border}`;
            
            card.onclick = () => openDetail(d.key, d);
            
            let displayTitle = d.title && d.title.trim() !== "" 
                ? escapeHTML(d.title) 
                : (d.content ? escapeHTML(d.content.substring(0, 30).replace(/\n/g, ' ')) + "..." : 'Tanpa Judul');

            card.innerHTML = `<div class="note-info"><div class="note-title">${displayTitle}</div></div><div class="note-date">${formatDate(d.timestamp)}</div>`;
            grid.appendChild(card);
        });
    });
}

// ==========================================
// LOGIKA SALIN & HAPUS CEPAT DARI BAWAH (FAB)
// ==========================================
function handleQuickCopyDelete() {
    if (allNotesData.length === 0) {
        return showToast("Tidak ada catatan untuk disalin", "error");
    }
    
    const btn = document.getElementById('fab-quick-btn');
    const icon = btn.querySelector('i');

    if (!quickDeletePending) {
        // TAP 1: Ambil catatan Paling Bawah (Index Terakhir / Terlama)
        const bottomNote = allNotesData[allNotesData.length - 1];
        
        // Kunci ID Catatan secara spesifik agar tidak terhapus saat reset
        quickDeleteTargetKey = bottomNote.key; 

        // Salin Konten
        const text = bottomNote.content;
        if (navigator.clipboard && window.isSecureContext) { 
            navigator.clipboard.writeText(text).then(() => showToast("Disalin! Ketuk lagi untuk HAPUS", "warning")); 
        } else { 
            const ta = document.createElement("textarea"); ta.value = text; ta.style.position = "absolute"; ta.style.left = "-9999px"; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); showToast("Disalin! Ketuk lagi untuk HAPUS", "warning"); 
        }

        // Siap-siap untuk Tap 2 (Ubah UI Tombol)
        quickDeletePending = true;
        icon.classList.remove('fa-copy');
        icon.classList.add('fa-trash');
        btn.style.backgroundColor = '#f44336'; 

        // Batal otomatis setelah 2 detik jika tidak ditekan
        quickDeleteTimer = setTimeout(() => {
            resetQuickButton();
        }, 2000);

    } else {
        // TAP 2: Hapus Instan
        clearTimeout(quickDeleteTimer);
        
        // KUNCI UTAMA PERBAIKAN: Selamatkan ID target ke variabel lokal dulu
        const targetKeyToDestroy = quickDeleteTargetKey; 
        
        // Baru reset UI Tombolnya
        resetQuickButton();
        
        // Eksekusi penghapusan menggunakan ID yang diselamatkan
        if (targetKeyToDestroy) {
            db.ref(`${DB_PATH}/${targetKeyToDestroy}`).remove().then(() => { 
                showToast("Catatan terlama dihapus!"); 
            });
        }
    }
}

function resetQuickButton() {
    quickDeletePending = false;
    quickDeleteTargetKey = null; // Memori dibersihkan saat waktu habis/selesai
    if(quickDeleteTimer) clearTimeout(quickDeleteTimer);
    const btn = document.getElementById('fab-quick-btn');
    if(btn) {
        const icon = btn.querySelector('i');
        icon.classList.remove('fa-trash');
        icon.classList.add('fa-copy');
        btn.style.backgroundColor = '#2196f3'; // Kembali ke warna biru
    }
}

// ==========================================
// PENGATURAN WARNA (COLOR PICKER)
// ==========================================
function openColorModal() { document.getElementById('colorModal').classList.remove('hidden'); }
function closeColorModal() { document.getElementById('colorModal').classList.add('hidden'); }
function selectColor(c) {
    currentColor = c;
    document.getElementById('color-square').style.backgroundColor = colorStyles[c].square;
    if (!document.getElementById('viewDetail').classList.contains('hidden') && selectedNoteKey) {
        db.ref(`${DB_PATH}/${selectedNoteKey}`).update({ color: c });
        document.getElementById('view-color-square').style.backgroundColor = colorStyles[c].square;
    }
    closeColorModal();
}

window.onclick = function(event) {
    if (event.target.id === 'colorModal') { closeColorModal(); }
}

// ==========================================
// NAVIGASI VIEW
// ==========================================
function openAddForm() {
    isEditingNote = false; selectedNoteKey = null; currentNoteData = null;
    
    currentColor = 'white';
    document.getElementById('color-square').style.backgroundColor = colorStyles['white'].square;
    
    document.getElementById('editor-date').innerText = formatDate(Date.now());
    document.getElementById('note-title').value = "";
    document.getElementById('note-content').value = "";
    
    viewList.classList.add('hidden'); viewForm.classList.remove('hidden');
}

function cancelForm() {
    viewForm.classList.add('hidden');
    if (isEditingNote) viewDetail.classList.remove('hidden');
    else viewList.classList.remove('hidden');
}

function openDetail(key, data) {
    selectedNoteKey = key; currentNoteData = data; currentNoteRawContent = data.content;
    
    document.getElementById('view-date').innerText = formatDate(data.timestamp);
    document.getElementById('view-title').value = data.title || "";
    
    let savedColor = data.color || 'white';
    document.getElementById('view-color-square').style.backgroundColor = colorStyles[savedColor].square;
    
    document.getElementById('view-content').innerText = data.content;
    
    resetDeleteButton();
    viewList.classList.add('hidden'); viewDetail.classList.remove('hidden');
}

function closeDetail() { viewDetail.classList.add('hidden'); viewList.classList.remove('hidden'); resetDeleteButton(); }

function editFromDetail() {
    isEditingNote = true;
    
    currentColor = currentNoteData.color || 'white';
    document.getElementById('color-square').style.backgroundColor = colorStyles[currentColor].square;
    
    document.getElementById('editor-date').innerText = formatDate(Date.now());
    document.getElementById('note-title').value = (currentNoteData.title === "Tanpa Judul") ? "" : currentNoteData.title;
    document.getElementById('note-content').value = currentNoteRawContent;
    
    viewDetail.classList.add('hidden'); viewForm.classList.remove('hidden');
}

// ==========================================
// LOGIKA DATABASE (SIMPAN & HAPUS DETAIL)
// ==========================================
function saveNote() {
    let t = document.getElementById('note-title').value.trim(); 
    const c = document.getElementById('note-content').value.trim();
    if(!c || c === "") return showToast("⚠️ Konten tidak boleh kosong!", "error");
    
    db.ref(DB_PATH).once('value').then(snapshot => {
        let isDuplicate = false; let usedNumbers = new Set();
        snapshot.forEach(child => {
            let exTitle = child.val().title; let exContent = child.val().content;
            if (exTitle && /^\d+$/.test(exTitle.toString().trim())) { usedNumbers.add(parseInt(exTitle.toString().trim())); }
            if (exContent && exContent.trim() === c) { if (!isEditingNote || selectedNoteKey !== child.key) isDuplicate = true; }
        });
        
        if (isDuplicate) return showToast("⚠️ Gagal: Catatan yang sama persis sudah ada!", "error");
        
        if (!t) {
            let nextNum = 1; while (usedNumbers.has(nextNum)) nextNum++;
            executeSave(nextNum.toString(), c);
        } else { 
            executeSave(t, c); 
        }
    });
}

function executeSave(title, content) {
    const data = { title: title, content: content, timestamp: Date.now(), color: currentColor };
    const promise = (isEditingNote && selectedNoteKey) ? db.ref(`${DB_PATH}/${selectedNoteKey}`).update(data) : db.ref(DB_PATH).push(data);
    promise.then(() => { 
        viewForm.classList.add('hidden'); viewList.classList.remove('hidden'); 
        isEditingNote = false; showToast("Catatan tersimpan!"); 
    });
}

// Logika Double Tap Delete Detail
function handleDeleteTap() {
    const btn = document.getElementById('btn-delete-detail');
    const icon = btn.querySelector('i');

    if (!deletePending) {
        deletePending = true;
        icon.classList.remove('fa-trash');
        icon.classList.add('fa-exclamation-triangle'); 
        btn.style.color = '#ff9500';
        showToast("Ketuk sekali lagi untuk HAPUS", "warning");

        deleteTimer = setTimeout(() => {
            resetDeleteButton();
        }, 2000);
    } else {
        clearTimeout(deleteTimer);
        resetDeleteButton();
        
        db.ref(`${DB_PATH}/${selectedNoteKey}`).remove().then(() => { 
            viewDetail.classList.add('hidden'); 
            viewList.classList.remove('hidden'); 
            showToast("Catatan dihapus."); 
        });
    }
}

function resetDeleteButton() {
    deletePending = false;
    if(deleteTimer) clearTimeout(deleteTimer);
    const btn = document.getElementById('btn-delete-detail');
    if(btn) {
        const icon = btn.querySelector('i');
        icon.classList.remove('fa-exclamation-triangle');
        icon.classList.add('fa-trash');
        btn.style.color = '#f44336';
    }
}

// ==========================================
// UTILS & FITUR TAMBAHAN
// ==========================================
function formatDate(ts) {
    if(!ts) return "---"; const d = new Date(ts);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(-2)} ${String(d.getHours()).padStart(2, '0')}.${String(d.getMinutes()).padStart(2, '0')}`;
}

function escapeHTML(str) { 
    return str ? str.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m])) : ""; 
}

function showToast(pesan, type="success") {
    const t = document.getElementById("toast"); t.innerHTML = pesan;
    if (type === "warning") t.style.backgroundColor = "#ff9500";
    else t.style.backgroundColor = type === "error" ? "#f44336" : "#323232";
    t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 3000);
}

function copyNoteContent() {
    const text = currentNoteRawContent;
    if (navigator.clipboard && window.isSecureContext) { 
        navigator.clipboard.writeText(text).then(() => showToast("Berhasil disalin!")); 
    } else { 
        const ta = document.createElement("textarea"); ta.value = text; ta.style.position = "absolute"; ta.style.left = "-9999px"; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); showToast("Berhasil disalin!"); 
    }
}

async function pasteFromClipboard() {
    try {
        const text = await navigator.clipboard.readText();
        const contentInput = document.getElementById('note-content');
        
        if (contentInput.value) {
            contentInput.value += '\n' + text;
        } else {
            contentInput.value = text;
        }
        showToast("Teks berhasil ditempel!");
    } catch (err) {
        showToast("Gagal menempel! Izinkan akses clipboard.", "error");
    }
}

window.onload = initNotesSync;
