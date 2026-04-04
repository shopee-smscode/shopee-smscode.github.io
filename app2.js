const BASE_URL = "https://hero-sms-proxy.masreno6pro.workers.dev"; // [!] GANTI DENGAN URL WORKER ANDA

// ==========================================
// 0. KONFIGURASI FIREBASE CATATANKU
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

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.database();
const DB_PATH = 'notes/public';

// Variabel Global
let selectedNoteKey = null;
let isEditingNote = false;
let currentNoteRawContent = "";
let viewingPresenceRef = null;
let isPresenceListenerAttached = false;
let activeAccountName = null;
let activeOrders = [];
let availableProducts = []; 
let selectedProductId = null; // Menyimpan operator terpilih
let timerInterval = null;
let pollingInterval = null;

const usdFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 3 });

// DOM Elements
const accountView = document.getElementById('accountView');
const appView = document.getElementById('appView');
const accountListContainer = document.getElementById('accountListContainer');
const btnSwitchAccount = document.getElementById('btnSwitchAccount');
const currentAccountName = document.getElementById('currentAccountName');
const productList = document.getElementById('productList');
const btnOrder = document.getElementById('btnOrder');
const activeOrdersContainer = document.getElementById('activeOrdersContainer');
const activeCount = document.getElementById('activeCount');
const balanceDisplay = document.getElementById('balanceDisplay');
const exitModal = document.getElementById('exitModal');
const notesListModal = document.getElementById('notesListModal');
const noteFormModal = document.getElementById('noteFormModal');
const noteDetailModal = document.getElementById('noteDetailModal');
const notesCountDisplay = document.getElementById('notesCount');
const btnOpenNotes = document.getElementById('btnOpenNotes');
const btnSwitchLobi = document.querySelector('#accountView .btn-switch');

// ==========================================
// 1. PEMBUATAN TOMBOL SALIN SANDI OTOMATIS
// ==========================================
if (btnOrder) {
    const btnCopyPassword = document.createElement('button');
    btnCopyPassword.innerHTML = '<i class="fas fa-copy"></i> Salin Sandi';
    btnCopyPassword.style.width = "100%";
    btnCopyPassword.style.padding = "12px";
    btnCopyPassword.style.marginTop = "10px";
    btnCopyPassword.style.backgroundColor = "#4a4a4a"; 
    btnCopyPassword.style.color = "white";
    btnCopyPassword.style.border = "none";
    btnCopyPassword.style.borderRadius = "8px";
    btnCopyPassword.style.fontWeight = "bold";
    btnCopyPassword.style.fontSize = "16px";
    btnCopyPassword.style.cursor = "pointer";
    btnCopyPassword.style.transition = "0.3s";
    
    btnCopyPassword.onmousedown = () => btnCopyPassword.style.opacity = "0.8";
    btnCopyPassword.onmouseup = () => btnCopyPassword.style.opacity = "1";
    
    btnCopyPassword.onclick = () => copyToClipboard("Aku123..");
    
    btnOrder.parentNode.insertBefore(btnCopyPassword, btnOrder.nextSibling);
}

// ==========================================
// 2. SISTEM TOMBOL KEMBALI (BACK) & KELUAR
// ==========================================
let isExitModalOpen = false;

window.addEventListener('popstate', (e) => {
    if (activeAccountName !== null) {
        if (!noteFormModal.classList.contains('hidden')) { handleCancelNoteForm(); history.pushState(null, null, "#sms"); }
        else if (!noteDetailModal.classList.contains('hidden')) { closeNoteDetailModal(); history.pushState(null, null, "#sms"); }
        else if (!notesListModal.classList.contains('hidden')) { closeNotesListModal(); history.pushState(null, null, "#sms"); }
        else { logoutAccount(); }
    } else {
        if (!noteFormModal.classList.contains('hidden')) { handleCancelNoteForm(); history.pushState(null, null, window.location.href); }
        else if (!noteDetailModal.classList.contains('hidden')) { closeNoteDetailModal(); history.pushState(null, null, window.location.href); }
        else if (!notesListModal.classList.contains('hidden')) { closeNotesListModal(); history.pushState(null, null, window.location.href); }
        else if (isExitModalOpen) { closeExitModal(); history.pushState(null, null, window.location.href); }
        else { exitModal.classList.remove('hidden'); isExitModalOpen = true; history.pushState(null, null, window.location.href); }
    }
});

function closeExitModal() { exitModal.classList.add('hidden'); isExitModalOpen = false; }
function confirmExit() { 
    setAccountViewingStatus(false); 
    window.close(); 
    if (navigator.app) navigator.app.exitApp(); 
    else if (navigator.device) navigator.device.exitApp(); 
    else window.history.go(-2); 
}

// ==========================================
// 3. UTILS & STORAGE
// ==========================================
async function apiCall(endpoint, method = "GET", body = null) {
    const options = { method, headers: { "Content-Type": "application/json", "X-Account-Name": activeAccountName } };
    if (body) options.body = JSON.stringify(body);
    const response = await fetch(`${BASE_URL}${endpoint}`, options);
    return await response.json();
}

function saveToStorage() { 
    localStorage.setItem(`hero_orders_${activeAccountName}`, JSON.stringify(activeOrders)); 
    updateAccountOrdersStatus();
    renderOrders(); 
}

// UI Moderen untuk Toast
function showToast(pesan, type = "success") { 
    const t = document.getElementById("toast"); 
    if(!t) return;
    
    t.innerHTML = pesan; 
    
    if (type === "error") {
        t.style.backgroundColor = "#ef4444"; 
        t.style.color = "#ffffff";
        t.style.boxShadow = "0 4px 12px rgba(239, 68, 68, 0.4)";
    } else {
        t.style.backgroundColor = "#1f2937"; 
        t.style.color = "#ffffff";
        t.style.boxShadow = "0 4px 12px rgba(0,0,0,0.15)";
    }
    
    t.classList.add("show"); 
    setTimeout(() => t.classList.remove("show"), 3000); 
}

function copyToClipboard(t) { 
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(t).then(() => { showToast("Berhasil disalin!"); }).catch(err => { copyFallback(t); });
    } else { copyFallback(t); }
}

function copyFallback(t) {
    const ta = document.createElement("textarea"); 
    ta.value = t; 
    ta.setAttribute('readonly', ''); 
    ta.style.position = "absolute"; 
    ta.style.left = "-9999px";
    document.body.appendChild(ta); 
    ta.select(); 
    ta.setSelectionRange(0, 99999);
    try { document.execCommand('copy'); showToast("Berhasil disalin!"); } catch (err) { showToast("Gagal menyalin.", "error"); } 
    document.body.removeChild(ta);
}

// ==========================================
// 4. FUNGSI MULTI-AKUN & PRESENCE
// ==========================================
window.toggleAccountList = function() {
    const isHidden = accountListContainer.classList.contains('hidden');
    const icon = document.getElementById('accountListIcon');
    if (isHidden) { 
        accountListContainer.classList.remove('hidden'); 
        if(icon) icon.className = "fas fa-chevron-up"; 
    } else { 
        accountListContainer.classList.add('hidden'); 
        if(icon) icon.className = "fas fa-chevron-down"; 
    }
};

function setAccountViewingStatus(isViewing) {
    if (!activeAccountName) return;
    if (isViewing) {
        const connectedRef = db.ref('.info/connected');
        viewingPresenceRef = db.ref(`presence/${activeAccountName}/is_viewing`);
        connectedRef.on('value', (snap) => {
            if (snap.val() === true) { 
                viewingPresenceRef.onDisconnect().set(false); 
                viewingPresenceRef.set(true); 
            }
        });
    } else {
        if (viewingPresenceRef) { 
            viewingPresenceRef.set(false); 
            viewingPresenceRef.onDisconnect().cancel(); 
        }
    }
}

function updateAccountOrdersStatus() {
    if (!activeAccountName) return;
    db.ref(`presence/${activeAccountName}/has_orders`).set(activeOrders.length > 0);
}

function syncPresenceUI() {
    if (isPresenceListenerAttached) return;
    isPresenceListenerAttached = true;
    db.ref('presence').on('value', snapshot => {
        const data = snapshot.val() || {};
        document.querySelectorAll('.account-card').forEach(card => {
            const el = card.querySelector('.account-name');
            if(!el) return;
            const accName = el.innerText;
            const safeId = `status-${accName.replace(/[^a-zA-Z0-9]/g, '-')}`;
            const statusSpan = document.getElementById(safeId);
            if (statusSpan) {
                const accData = data[accName] || {};
                const isOnline = accData.is_viewing === true || accData.has_orders === true;
                if (isOnline) { 
                    statusSpan.innerText = "Online"; 
                    statusSpan.className = "account-status status-online"; 
                } else { 
                    statusSpan.innerText = "Offline"; 
                    statusSpan.className = "account-status status-offline"; 
                }
            }
        });
    });
}

async function fetchAccounts() {
    try {
        const res = await fetch(`${BASE_URL}/api/accounts`);
        const data = await res.json();
        accountListContainer.innerHTML = "";
        if (data.accounts && data.accounts.length > 0) {
            data.accounts.forEach(accountName => {
                const initial = accountName.charAt(0).toUpperCase();
                const safeId = `status-${accountName.replace(/[^a-zA-Z0-9]/g, '-')}`;
                const card = document.createElement('div');
                card.className = "account-card";
                card.innerHTML = `
                    <div class="account-info-wrapper">
                        <div class="account-avatar">${initial}</div>
                        <div class="account-details">
                            <span class="account-name">${accountName}</span>
                            <span id="${safeId}" class="account-status status-offline">Offline</span>
                        </div>
                    </div>
                    <i class="fas fa-chevron-right chevron-icon"></i>`;
                card.onclick = () => loginAccount(accountName);
                accountListContainer.appendChild(card);
            });
            syncPresenceUI();
        } else { 
            accountListContainer.innerHTML = '<div class="status-text">Tidak ada akun ditemukan.</div>'; 
        }
    } catch (error) { 
        accountListContainer.innerHTML = '<div class="status-text" style="color:red">Gagal terhubung ke Server.</div>'; 
    }
}

function loginAccount(accountName) {
    activeAccountName = accountName;
    if(currentAccountName) currentAccountName.innerText = accountName;
    sessionStorage.setItem('hero_savedAccountName', accountName);
    setAccountViewingStatus(true);
    history.pushState(null, null, "#sms"); 
    
    accountView.classList.add('hidden');
    appView.classList.remove('hidden');
    
    const rawOrders = JSON.parse(localStorage.getItem(`hero_orders_${accountName}`)) || [];
    activeOrders = rawOrders.filter(o => o.expiresAt > Date.now());
    if (rawOrders.length !== activeOrders.length) saveToStorage();
    
    initMainApp();
}

function logoutAccount() {
    if (timerInterval) clearInterval(timerInterval);
    if (pollingInterval) clearInterval(pollingInterval);
    setAccountViewingStatus(false);
    sessionStorage.removeItem('hero_savedAccountName');
    
    appView.classList.add('hidden');
    accountView.classList.remove('hidden');
    activeAccountName = null;
    accountListContainer.classList.add('hidden');
    
    const icon = document.getElementById('accountListIcon');
    if(icon) icon.className = "fas fa-chevron-down";
    
    fetchAccounts();
    history.pushState(null, null, window.location.href);
}

if(btnSwitchAccount) btnSwitchAccount.onclick = () => logoutAccount();

// ==========================================
// 5. FUNGSI CATATANKU (FIREBASE)
// ==========================================
window.openNotesFromAnywhere = function() { 
    notesListModal.classList.remove('hidden'); 
    history.pushState(null, null, "#notes"); 
};

if (btnOpenNotes) btnOpenNotes.onclick = openNotesFromAnywhere;
if (btnSwitchLobi) btnSwitchLobi.onclick = openNotesFromAnywhere;

function closeNotesListModal() { 
    notesListModal.classList.add('hidden'); 
}

function initNotesSync() {
    const grid = document.getElementById('notes-grid'); 
    if (!grid) return;
    
    db.ref(DB_PATH).orderByChild('timestamp').on('value', snapshot => {
        grid.innerHTML = ''; 
        let items = []; 
        snapshot.forEach(child => { items.push({ key: child.key, ...child.val() }); });
        
        if(notesCountDisplay) notesCountDisplay.innerText = `(${items.length})`;
        
        if(items.length === 0) { 
            grid.innerHTML = '<div class="status-text">Belum ada catatan.</div>'; 
            return; 
        }
        
        items.reverse().forEach((d) => {
            const card = document.createElement('div'); 
            card.className = 'note-card'; 
            card.onclick = () => openNoteDetailModal(d.key, d);
            const previewText = escapeHTML(d.content).replace(/\n/g, ' ');
            card.innerHTML = `<div class="note-title">${escapeHTML(d.title) || 'Tanpa Judul'}</div><div class="note-preview">${previewText}</div><div class="note-date">${formatDate(d.timestamp)}</div>`;
            grid.appendChild(card);
        });
    });
}

function formatDate(ts) {
    if(!ts) return "---";
    const d = new Date(ts);
    const date = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(-2)}`;
    const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    return `${date} - ${time}`;
}

function escapeHTML(str) { 
    if(!str) return ""; 
    return str.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m])); 
}

function openAddNoteModal() { 
    isEditingNote = false; 
    document.getElementById('form-modal-title').innerText = "Catatan Baru"; 
    document.getElementById('note-title').value = ""; 
    document.getElementById('note-content').value = ""; 
    notesListModal.classList.add('hidden'); 
    noteFormModal.classList.remove('hidden'); 
    history.pushState(null, null, "#noteForm"); 
}

function openNoteDetailModal(key, data) {
    selectedNoteKey = key;
    currentNoteRawContent = data.content;
    document.getElementById('view-tag').innerText = `Dibuat: ${formatDate(data.timestamp)}`;
    document.getElementById('view-title').value = data.title || "Tanpa Judul";
    document.getElementById('view-content').innerText = data.content;
    
    notesListModal.classList.add('hidden');
    noteDetailModal.classList.remove('hidden');
    history.pushState(null, null, "#noteDetail");
}

function closeNoteDetailModal() { 
    noteDetailModal.classList.add('hidden'); 
    notesListModal.classList.remove('hidden'); 
}

function handleCancelNoteForm() { 
    noteFormModal.classList.add('hidden'); 
    if (isEditingNote) { noteDetailModal.classList.remove('hidden'); } 
    else { notesListModal.classList.remove('hidden'); } 
}

function editFromDetail() { 
    const t = document.getElementById('view-title').value; 
    const c = currentNoteRawContent; 
    noteDetailModal.classList.add('hidden'); 
    isEditingNote = true; 
    document.getElementById('form-modal-title').innerText = "Edit Catatan"; 
    document.getElementById('note-title').value = (t === "Tanpa Judul") ? "" : t; 
    document.getElementById('note-content').value = c; 
    noteFormModal.classList.remove('hidden'); 
}

function handleSaveNote() {
    let t = document.getElementById('note-title').value.trim(); 
    const c = document.getElementById('note-content').value.trim();
    
    if(!c || c === "") return showToast("⚠️ Konten tidak boleh kosong!", "error");
    
    db.ref(DB_PATH).once('value').then(snapshot => {
        let isDuplicate = false;
        let usedNumbers = new Set();
        
        snapshot.forEach(child => {
            let existingTitle = child.val().title;
            let existingContent = child.val().content;
            
            if (existingTitle && /^\d+$/.test(existingTitle.toString().trim())) {
                usedNumbers.add(parseInt(existingTitle.toString().trim()));
            }
            
            if (existingContent && existingContent.trim() === c) {
                if (!isEditingNote || selectedNoteKey !== child.key) {
                    isDuplicate = true;
                }
            }
        });
        
        if (isDuplicate) {
            showToast("⚠️ Gagal: Catatan dengan isi yang sama sudah ada!", "error");
            return;
        }
        
        if (!t) {
            let nextNum = 1;
            while (usedNumbers.has(nextNum)) { nextNum++; }
            executeSaveNote(nextNum.toString(), c);
        } else {
            executeSaveNote(t, c);
        }
    });
}

function executeSaveNote(title, content) {
    const data = { title: title, content: content, timestamp: Date.now() };
    const promise = (isEditingNote && selectedNoteKey) ? db.ref(`${DB_PATH}/${selectedNoteKey}`).update(data) : db.ref(DB_PATH).push(data);
    promise.then(() => { 
        noteFormModal.classList.add('hidden'); 
        notesListModal.classList.remove('hidden'); 
        isEditingNote = false; 
        showToast("Catatan tersimpan!"); 
    });
}

function confirmDeleteNote() { 
    if(confirm("Hapus catatan ini?")) { 
        db.ref(`${DB_PATH}/${selectedNoteKey}`).remove().then(() => { 
            noteDetailModal.classList.add('hidden'); 
            notesListModal.classList.remove('hidden'); 
            showToast("Catatan dihapus."); 
        }); 
    } 
}

function copyNoteContent() { copyToClipboard(currentNoteRawContent); }

// ==========================================
// 6. SISTEM LOAD SERVER (PILIHAN OPERATOR)
// ==========================================
async function fetchBalance() { 
    try { 
        if (balanceDisplay) balanceDisplay.innerText = "Menghitung...";
        const res = await apiCall('/balance'); 
        if (res.success) { 
            if (balanceDisplay) balanceDisplay.innerText = usdFormatter.format(res.data.balance); 
        } else {
            if (balanceDisplay) balanceDisplay.innerText = "Gagal";
        }
    } catch (error) { 
        if (balanceDisplay) balanceDisplay.innerText = "Error"; 
    } 
}

async function loadShopeeIndonesia() {
    try {
        // Ubah text judul dinamis di UI HTML tanpa perlu mengubah index2.html
        const titleEl = document.querySelector('.section-title:last-of-type');
        if (titleEl && titleEl.innerText.includes("Top 3")) titleEl.innerText = "Pilih Operator (Termurah)";

        if (productList) productList.innerHTML = '<div class="status-text">Mencari Operator...</div>';
        
        const productsRes = await apiCall(`/catalog/products`);
        
        if (productsRes.success && productsRes.data.length > 0) {
            let ops = productsRes.data;
            
            // 1. Cari Acak (any) atau buat dummy jika belum ada
            let anyOp = ops.find(o => o.id === 'any');
            if (!anyOp) anyOp = { id: 'any', price: ops[0]?.price || 0, available: 'Acak' };
            
            // 2. Saring operator sisa dan urutkan dari harga termurah
            let specificOps = ops.filter(o => o.id !== 'any').sort((a, b) => parseFloat(a.price) - parseFloat(b.price));
            
            // 3. Gabungkan 1 Acak (default) di puncak + 3 operator termurah
            availableProducts = [anyOp, ...specificOps.slice(0, 3)]; 
            
            if (productList) productList.innerHTML = ""; 
            if (availableProducts.length > 0) { 
                selectedProductId = availableProducts[0].id; // Setel Any (Acak) sebagai default
                if (btnOrder) btnOrder.disabled = false; 
            }
            
            availableProducts.forEach(product => {
                const card = document.createElement("div"); 
                card.className = "product-card"; 
                if (selectedProductId === product.id) card.classList.add('selected');
                
                // Format label yang cantik
                const opName = product.id === 'any' ? '⭐ Acak (Semua Operator)' : `📡 ${product.id.toUpperCase()}`;
                const stockLabel = product.available > 1000 ? "1000+" : product.available;
                
                card.innerHTML = `<div class="product-info"><h4>${opName}</h4><p>Stok: ${stockLabel}</p></div><div class="product-price">${usdFormatter.format(product.price)}</div>`;
                
                card.onclick = () => { 
                    document.querySelectorAll('.product-card').forEach(c => c.classList.remove('selected')); 
                    card.classList.add('selected'); 
                    selectedProductId = product.id; 
                    if (btnOrder) btnOrder.disabled = false; 
                };
                if (productList) productList.appendChild(card);
            });
        } else {
            if (productList) productList.innerHTML = '<div class="status-text">Stok sedang kosong.</div>';
        }
    } catch (error) { 
        if (productList) productList.innerHTML = `<div class="status-text" style="color:red;">Error muat data.</div>`; 
    }
}

// ==========================================
// 7. RENDER KARTU PESANAN
// ==========================================
function renderOrders() {
    if (activeCount) activeCount.innerText = activeOrders.length;
    if (activeOrders.length === 0) { 
        if (activeOrdersContainer) activeOrdersContainer.innerHTML = '<div class="status-text">Belum ada pesanan aktif.</div>'; 
        return; 
    }
    if (activeOrdersContainer) activeOrdersContainer.innerHTML = "";
    const now = Date.now();

    activeOrders.forEach(order => {
        const card = document.createElement("div"); 
        card.className = "order-card"; 
        card.id = `order-card-${order.id}`;
        
        const isSuccess = (order.status === "OTP_RECEIVED" && order.otp);
        const displayPrice = (order.price && order.price != 0) ? usdFormatter.format(order.price) : usdFormatter.format(availableProducts[0]?.price || 0);
        
        const wait = order.cancelUnlockTime - now; 
        
        let cancelBtnAttr = ""; let cancelBtnText = "Batalkan"; 
        let actionBtnAttr = ""; let replaceBtnText = '<i class="fas fa-sync-alt"></i> Ganti'; let resendBtnText = '<i class="fas fa-envelope"></i> Ulang'; 
        let finishBtnAttr = "disabled";

        if (isSuccess) { 
            cancelBtnAttr = "disabled"; cancelBtnText = "Sukses"; 
            actionBtnAttr = "disabled"; replaceBtnText = '<i class="fas fa-check"></i>'; resendBtnText = '<i class="fas fa-check"></i>'; 
            finishBtnAttr = ""; 
        } else if (wait > 0) {
            cancelBtnAttr = "disabled"; 
            actionBtnAttr = "disabled"; 
        }
        
        // Tampilkan info operator di pojok kanan label order-id
        const opTag = order.productId ? (order.productId === 'any' ? 'Acak' : order.productId.toUpperCase()) : '';

        card.innerHTML = `
            <div class="order-header"><div><span class="order-id-label">#${order.id} ${opTag ? `(${opTag})` : ''}</span> <span class="order-price">${displayPrice}</span></div><span class="timer" id="timer-${order.id}">--:--</span></div>
            <div class="phone-row"><span class="phone-number">${order.phone}</span><button class="btn-copy" onclick="copyToClipboard('${order.phone}')">Salin</button></div>
            <div class="otp-display ${isSuccess ? 'success-glow' : ''}">${isSuccess ? '<div class="otp-title">KODE OTP</div><div class="otp-code">'+order.otp+'</div>' : '<div class="modern-loader"><span></span><span></span><span></span></div><div class="waiting-text">MENUNGGU SMS</div>'}</div>
            <div class="action-buttons-grid">
                <button class="btn-replace" id="btn-replace-${order.id}" onclick="replaceSpecificOrder('${order.id}')" ${actionBtnAttr}>${replaceBtnText}</button>
                <button class="btn-resend" id="btn-resend-${order.id}" onclick="resendSpecificOrder('${order.id}')" ${actionBtnAttr}>${resendBtnText}</button>
                <button class="btn-danger" id="btn-cancel-${order.id}" onclick="cancelSpecificOrder('${order.id}')" ${cancelBtnAttr}>${cancelBtnText}</button>
                <button class="btn-success" id="btn-finish-${order.id}" onclick="finishSpecificOrder('${order.id}')" ${finishBtnAttr}>Selesai</button>
            </div>`;
        if (activeOrdersContainer) activeOrdersContainer.appendChild(card);
    });
}

// ==========================================
// 8. TIMER & POLLING
// ==========================================
function startPollingAndTimer() {
    if (timerInterval) clearInterval(timerInterval);
    if (pollingInterval) clearInterval(pollingInterval);
    
    timerInterval = setInterval(() => {
        const now = Date.now();
        activeOrders.forEach((o, i) => {
            const left = o.expiresAt - now;
            const el = document.getElementById(`timer-${o.id}`);
            if (left <= 0) { 
                activeOrders.splice(i, 1); 
                saveToStorage(); 
                fetchBalance(); 
                return; 
            }
            if (el) { 
                const m = Math.floor(left/60000);
                const s = Math.floor((left%60000)/1000); 
                el.innerText = `${m}:${s<10?'0':''}${s}`; 
            }

            const wait = o.cancelUnlockTime - now;
            const btnCancel = document.getElementById(`btn-cancel-${o.id}`); 
            const btnReplace = document.getElementById(`btn-replace-${o.id}`); 
            const btnResend = document.getElementById(`btn-resend-${o.id}`); 

            if (o.status !== "OTP_RECEIVED") {
                if (wait <= 0) {
                    if (btnCancel && btnCancel.innerText !== "Memproses...") btnCancel.disabled = false;
                    if (btnReplace && !btnReplace.innerHTML.includes('loader')) btnReplace.disabled = false;
                    if (btnResend && !btnResend.innerHTML.includes('loader')) btnResend.disabled = false;
                } else {
                    if (btnCancel) btnCancel.disabled = true;
                    if (btnReplace) btnReplace.disabled = true;
                    if (btnResend) btnResend.disabled = true;
                }
            }
        });
    }, 1000);
    
    pollingInterval = setInterval(async () => {
        if (activeOrders.length === 0) return;
        activeOrders.forEach(async (o, i) => {
            if (o.status === "OTP_RECEIVED") return;
            try {
                const res = await apiCall(`/orders/${o.id}`);
                if (res.success && res.data.status === "OTP_RECEIVED") { 
                    activeOrders[i].status = "OTP_RECEIVED"; 
                    activeOrders[i].otp = res.data.otp_code; 
                    saveToStorage(); 
                } else if (res.success && res.data.status === "CANCELLED") { 
                    activeOrders = activeOrders.filter(ord => String(ord.id) !== String(o.id)); 
                    saveToStorage(); 
                    fetchBalance(); 
                }
            } catch(e) {}
        });
    }, 5000);
}

// ==========================================
// 9. AKSI TOMBOL PESAN & LAINNYA
// ==========================================
if (btnOrder) {
    btnOrder.onclick = async () => {
        btnOrder.disabled = true; 
        btnOrder.innerText = "Memproses...";
        try {
            // MENGIRIM OPERATOR YANG DIPILIH KE WORKER
            const res = await apiCall('/orders/create', 'POST', { operator: selectedProductId });
            if (res.success) {
                const o = res.data.orders[0];
                
                // Cari info operator buat menyimpan harganya secara lokal di UI
                const opInfo = availableProducts.find(p => p.id === selectedProductId);
                const opPrice = opInfo ? opInfo.price : 0;
                
                activeOrders.unshift({ 
                    id: o.id, productId: selectedProductId, phone: o.phone_number, 
                    price: opPrice, otp: null, status: "ACTIVE", 
                    expiresAt: Date.now() + (20 * 60 * 1000), 
                    cancelUnlockTime: Date.now() + 120000, 
                    isAutoCanceling: false 
                });
                saveToStorage(); 
                startPollingAndTimer(); 
                fetchBalance(); 
                copyToClipboard(o.phone_number);
            } else { 
                showToast(res.error.message, "error"); 
            }
        } catch (e) { 
            showToast("Gagal terhubung.", "error"); 
        }
        btnOrder.disabled = false; 
        btnOrder.innerText = "Pesan Nomor Baru";
    };
}

window.replaceSpecificOrder = async function(orderId) {
    const idStr = String(orderId); 
    
    // Default Ganti menggunakan operator yang sama dengan pesanan sebelumnya,
    // Jika tidak ada data sebelumnya, fallback ke pilihan UI saat ini.
    const oldOrder = activeOrders.find(o => String(o.id) === idStr);
    const opToUse = oldOrder ? oldOrder.productId : selectedProductId;
    
    const btn = document.getElementById(`btn-replace-${idStr}`); 
    if (btn) { btn.disabled = true; btn.innerHTML = '<div class="loader"></div>'; }
    try {
        await apiCall('/orders/cancel', 'POST', { id: idStr });
        activeOrders = activeOrders.filter(o => String(o.id) !== idStr); 
        
        const n = await apiCall('/orders/create', 'POST', { operator: opToUse });
        if (n.success) {
            const od = n.data.orders[0];
            const opInfo = availableProducts.find(p => p.id === opToUse);
            const opPrice = opInfo ? opInfo.price : (oldOrder ? oldOrder.price : 0);
            
            activeOrders.unshift({ 
                id: od.id, productId: opToUse, phone: od.phone_number, 
                price: opPrice, otp: null, status: "ACTIVE", 
                expiresAt: Date.now() + (20 * 60 * 1000), 
                cancelUnlockTime: Date.now() + 120000, 
                isAutoCanceling: false 
            });
            saveToStorage(); 
            startPollingAndTimer(); 
            fetchBalance(); 
            copyToClipboard(od.phone_number); 
            showToast("Nomor diganti!");
        } else { 
            saveToStorage(); fetchBalance(); showToast("Gagal pesan baru.", "error"); 
        }
    } catch (e) { 
        showToast("Error.", "error"); 
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-sync-alt"></i> Ganti'; } 
    }
};

window.cancelSpecificOrder = async function(id) {
    const idStr = String(id); 
    const btnCancel = document.getElementById(`btn-cancel-${idStr}`); 
    if (btnCancel) { btnCancel.disabled = true; btnCancel.innerText = "Memproses..."; }
    try { 
        await apiCall('/orders/cancel', 'POST', { id: idStr }); 
        activeOrders = activeOrders.filter(o => String(o.id) !== idStr); 
        saveToStorage(); 
        fetchBalance();
    } catch (e) { 
        if (btnCancel) btnCancel.disabled = false; 
    }
};

window.finishSpecificOrder = async function(id) {
    const idStr = String(id); 
    const btnFinish = document.getElementById(`btn-finish-${idStr}`); 
    if (btnFinish) { btnFinish.disabled = true; btnFinish.innerText = "Menutup..."; }
    try { await apiCall('/orders/finish', 'POST', { id: idStr }); } catch (e) {} 
    activeOrders = activeOrders.filter(o => String(o.id) !== idStr); 
    saveToStorage();
};

window.resendSpecificOrder = async function(id) {
    const idStr = String(id); 
    const btn = document.getElementById(`btn-resend-${idStr}`); 
    if (btn) { btn.disabled = true; btn.innerHTML = '<div class="loader"></div>'; }
    try { 
        const res = await apiCall('/orders/resend', 'POST', { id: idStr }); 
        if (res.success) showToast("Permintaan ulang dikirim."); 
        setTimeout(() => { 
            if (btn && !btn.innerHTML.includes('fa-check')) { 
                btn.disabled = false; 
                btn.innerHTML = '<i class="fas fa-envelope"></i> Ulang'; 
            } 
        }, 5000);
    } catch (e) { 
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-envelope"></i> Ulang'; } 
    }
};

// ==========================================
// 10. INISIALISASI UTAMA (ONLOAD)
// ==========================================
async function initMainApp() { 
    fetchBalance(); 
    await loadShopeeIndonesia(); 
    renderOrders(); 
    startPollingAndTimer(); 
}

window.onload = () => { 
    setAccountViewingStatus(false);
    history.pushState(null, null, window.location.href); 
    initNotesSync(); 
    const saved = sessionStorage.getItem('hero_savedAccountName');
    if(saved) {
        loginAccount(saved);
    } else {
        fetchAccounts();
    }
};
