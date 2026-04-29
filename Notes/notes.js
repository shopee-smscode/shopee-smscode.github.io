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
let isEditingNote = false;
let currentNoteRawContent = "";

// ==========================================
// INISIALISASI & RENDER
// ==========================================
function initNotesSync() {
    const grid = document.getElementById('notes-grid');
    db.ref(DB_PATH).orderByChild('timestamp').on('value', snapshot => {
        grid.innerHTML = ''; let items = [];
        snapshot.forEach(child => { items.push({ key: child.key, ...child.val() }); });
        
        document.getElementById('notesCount').innerText = `(${items.length})`;
        
        if(items.length === 0) { grid.innerHTML = '<div style="text-align:center; color:#9ca3af; padding: 20px;">Belum ada catatan.</div>'; return; }
        
        items.reverse().forEach((d) => {
            const card = document.createElement('div'); card.className = 'note-card'; 
            card.onclick = () => openDetail(d.key, d);
            const previewText = escapeHTML(d.content).replace(/\n/g, ' ');
            card.innerHTML = `<div class="note-title">${escapeHTML(d.title) || 'Tanpa Judul'}</div><div class="note-preview">${previewText}</div><div class="note-date">${formatDate(d.timestamp)}</div>`;
            grid.appendChild(card);
        });
    });
}

// ==========================================
// NAVIGASI VIEW
// ==========================================
function openAddForm() {
    isEditingNote = false; selectedNoteKey = null;
    document.getElementById('form-title').innerText = "Catatan Baru";
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
    selectedNoteKey = key; currentNoteRawContent = data.content;
    document.getElementById('view-tag').innerText = `Dibuat: ${formatDate(data.timestamp)}`;
    document.getElementById('view-title').value = data.title || "Tanpa Judul";
    document.getElementById('view-content').innerText = data.content;
    viewList.classList.add('hidden'); viewDetail.classList.remove('hidden');
}

function closeDetail() { viewDetail.classList.add('hidden'); viewList.classList.remove('hidden'); }

function editFromDetail() {
    const t = document.getElementById('view-title').value;
    isEditingNote = true;
    document.getElementById('form-title').innerText = "Edit Catatan";
    document.getElementById('note-title').value = (t === "Tanpa Judul") ? "" : t;
    document.getElementById('note-content').value = currentNoteRawContent;
    viewDetail.classList.add('hidden'); viewForm.classList.remove('hidden');
}

// ==========================================
// LOGIKA DATABASE (SIMPAN & HAPUS)
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
        } else { executeSave(t, c); }
    });
}

function executeSave(title, content) {
    const data = { title: title, content: content, timestamp: Date.now() };
    const promise = (isEditingNote && selectedNoteKey) ? db.ref(`${DB_PATH}/${selectedNoteKey}`).update(data) : db.ref(DB_PATH).push(data);
    promise.then(() => { 
        viewForm.classList.add('hidden'); viewList.classList.remove('hidden'); 
        isEditingNote = false; showToast("Catatan tersimpan!"); 
    });
}

function confirmDelete() {
    if(confirm("Apakah Anda yakin ingin menghapus catatan ini?")) {
        db.ref(`${DB_PATH}/${selectedNoteKey}`).remove().then(() => { 
            viewDetail.classList.add('hidden'); viewList.classList.remove('hidden'); showToast("Catatan dihapus."); 
        });
    }
}

// ==========================================
// UTILS & FITUR TAMBAHAN
// ==========================================
function formatDate(ts) {
    if(!ts) return "---"; const d = new Date(ts);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(-2)} - ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function escapeHTML(str) { 
    return str ? str.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m])) : ""; 
}

function showToast(pesan, type="success") {
    const t = document.getElementById("toast"); t.innerHTML = pesan;
    t.style.backgroundColor = type === "error" ? "#ef4444" : "#1f2937";
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
        console.error("Gagal membaca clipboard: ", err);
    }
}

// Mulai
window.onload = initNotesSync;
