const BASE_URL = "https://hero-sms-proxy.masreno6pro.workers.dev"; // [!] GANTI DENGAN URL WORKER HERO-SMS ANDA

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

let selectedNoteKey = null, isEditingNote = false, currentNoteRawContent = "";
let viewingPresenceRef = null, isPresenceListenerAttached = false;
let activeAccountName = null, activeOrders = [], availableProducts = [], selectedProductId = null, timerInterval = null, pollingInterval = null;

const usdFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 3 });

const accountView = document.getElementById('accountView'), appView = document.getElementById('appView'), accountListContainer = document.getElementById('accountListContainer'), btnSwitchAccount = document.getElementById('btnSwitchAccount'), currentAccountName = document.getElementById('currentAccountName'), productList = document.getElementById('productList'), btnOrder = document.getElementById('btnOrder'), activeOrdersContainer = document.getElementById('activeOrdersContainer'), activeCount = document.getElementById('activeCount'), balanceDisplay = document.getElementById('balanceDisplay'), exitModal = document.getElementById('exitModal'), notesListModal = document.getElementById('notesListModal'), noteFormModal = document.getElementById('noteFormModal'), noteDetailModal = document.getElementById('noteDetailModal'), notesCountDisplay = document.getElementById('notesCount');

// ==========================================
// 1. SISTEM BACK BUTTON & KELUAR
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
function confirmExit() { setAccountViewingStatus(false); window.close(); if (navigator.app) navigator.app.exitApp(); else if (navigator.device) navigator.device.exitApp(); else window.history.go(-2); }
function logoutAccount() {
    if (timerInterval) clearInterval(timerInterval); if (pollingInterval) clearInterval(pollingInterval);
    setAccountViewingStatus(false); sessionStorage.removeItem('hero_savedAccountName');
    appView.classList.add('hidden'); accountView.classList.remove('hidden'); activeAccountName = null;
    accountListContainer.classList.add('hidden'); const icon = document.getElementById('accountListIcon'); if(icon) icon.className = "fas fa-chevron-down";
    fetchAccounts(); history.pushState(null, null, window.location.href);
}
if(btnSwitchAccount) btnSwitchAccount.onclick = () => logoutAccount();

// ==========================================
// 2. MULTI-AKUN & STATUS PRESENCE
// ==========================================
window.toggleAccountList = function() {
    const isHidden = accountListContainer.classList.contains('hidden'); const icon = document.getElementById('accountListIcon');
    if (isHidden) { accountListContainer.classList.remove('hidden'); if(icon) icon.className = "fas fa-chevron-up"; } 
    else { accountListContainer.classList.add('hidden'); if(icon) icon.className = "fas fa-chevron-down"; }
}

function setAccountViewingStatus(isViewing) {
    if (!activeAccountName) return;
    if (isViewing) { const connectedRef = db.ref('.info/connected'); viewingPresenceRef = db.ref(`presence/${activeAccountName}/is_viewing`); connectedRef.on('value', (snap) => { if (snap.val() === true) { viewingPresenceRef.onDisconnect().set(false); viewingPresenceRef.set(true); } }); } 
    else { if (viewingPresenceRef) { viewingPresenceRef.set(false); viewingPresenceRef.onDisconnect().cancel(); } }
}

function updateAccountOrdersStatus() { if (!activeAccountName) return; db.ref(`presence/${activeAccountName}/has_orders`).set(activeOrders.length > 0); }

function syncPresenceUI() {
    if (isPresenceListenerAttached) return; isPresenceListenerAttached = true;
    db.ref('presence').on('value', snapshot => {
        const data = snapshot.val() || {};
        document.querySelectorAll('.account-card').forEach(card => {
            const el = card.querySelector('.account-name'); if(!el) return;
            const accName = el.innerText; const safeId = `status-${accName.replace(/[^a-zA-Z0-9]/g, '-')}`; const statusSpan = document.getElementById(safeId);
            if (statusSpan) { const accData = data[accName] || {}; const isOnline = accData.is_viewing === true || accData.has_orders === true; if (isOnline) { statusSpan.innerText = "Online"; statusSpan.className = "account-status status-online"; } else { statusSpan.innerText = "Offline"; statusSpan.className = "account-status status-offline"; } }
        });
    });
}

async function fetchAccounts() {
    try {
        const res = await fetch(`${BASE_URL}/api/accounts`); const data = await res.json(); accountListContainer.innerHTML = "";
        if (data.accounts && data.accounts.length > 0) {
            data.accounts.forEach(accountName => {
                const initial = accountName.charAt(0).toUpperCase(); const safeId = `status-${accountName.replace(/[^a-zA-Z0-9]/g, '-')}`;
                const card = document.createElement('div'); card.className = "account-card";
                card.innerHTML = `<div class="account-info-wrapper"><div class="account-avatar">${initial}</div><div class="account-details"><span class="account-name">${accountName}</span><span id="${safeId}" class="account-status status-offline">Offline</span></div></div><i class="fas fa-chevron-right chevron-icon"></i>`;
                card.onclick = () => loginAccount(accountName); accountListContainer.appendChild(card);
            }); syncPresenceUI();
        } else { accountListContainer.innerHTML = '<div class="status-text">Tidak ada akun ditemukan.</div>'; }
    } catch (error) { accountListContainer.innerHTML = '<div class="status-text" style="color:red">Gagal terhubung ke Server.</div>'; }
}

function loginAccount(accountName) {
    activeAccountName = accountName; if(currentAccountName) currentAccountName.innerText = accountName;
    sessionStorage.setItem('hero_savedAccountName', accountName); setAccountViewingStatus(true);
    history.pushState(null, null, "#sms"); accountView.classList.add('hidden'); appView.classList.remove('hidden');
    const rawOrders = JSON.parse(localStorage.getItem(`hero_orders_${accountName}`)) || [];
    activeOrders = rawOrders.filter(o => o.expiresAt > Date.now()); if (rawOrders.length !== activeOrders.length) saveToStorage();
    initMainApp();
}

async function apiCall(endpoint, method = "GET", body = null) {
    const options = { method: method, headers: { "Content-Type": "application/json", "X-Account-Name": activeAccountName } };
    if (body) options.body = JSON.stringify(body);
    const response = await fetch(`${BASE_URL}${endpoint}`, options); return await response.json();
}

function saveToStorage() { localStorage.setItem(`hero_orders_${activeAccountName}`, JSON.stringify(activeOrders)); updateAccountOrdersStatus(); renderOrders(); }
function showToast(pesan) { const t = document.getElementById("toast"); if(!t) return; t.innerText = pesan; t.classList.add("show"); setTimeout(() => { t.classList.remove("show"); }, 2500); }
function copyToClipboard(text) { if (navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(text).then(() => { showToast("Berhasil disalin!"); }).catch(err => { copyFallback(text); }); } else { copyFallback(text); } }
function copyFallback(text) { const ta = document.createElement("textarea"); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = "absolute"; ta.style.left = "-9999px"; document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, 99999); try { document.execCommand('copy'); showToast("Berhasil disalin!"); } catch (err) { showToast("Gagal menyalin."); } document.body.removeChild(ta); }

// ==========================================
// 3. FUNGSI CATATANKU (FIREBASE)
// ==========================================
window.openNotesFromAnywhere = function() { notesListModal.classList.remove('hidden'); history.pushState(null, null, "#notes"); };
const btnOpenNotes = document.getElementById('btnOpenNotes'); if (btnOpenNotes) btnOpenNotes.onclick = openNotesFromAnywhere;
const btnSwitchLobi = document.querySelector('#accountView .btn-switch'); if (btnSwitchLobi) btnSwitchLobi.onclick = openNotesFromAnywhere;
function closeNotesListModal() { notesListModal.classList.add('hidden'); }

function initNotesSync() {
    const grid = document.getElementById('notes-grid'); if (!grid) return;
    db.ref(DB_PATH).orderByChild('timestamp').on('value', snapshot => {
        grid.innerHTML = ''; let items = []; snapshot.forEach(child => { items.push({ key: child.key, ...child.val() }); });
        if(notesCountDisplay) notesCountDisplay.innerText = `(${items.length})`;
        if(items.length === 0) { grid.innerHTML = '<div class="status-text">Belum ada catatan.</div>'; return; }
        items.reverse().forEach((d) => {
            const card = document.createElement('div'); card.className = 'note-card'; card.onclick = () => openNoteDetailModal(d.key, d);
            const previewText = escapeHTML(d.content).replace(/\n/g, ' ');
            card.innerHTML = `<div class="note-title">${escapeHTML(d.title) || 'Tanpa Judul'}</div><div class="note-preview">${previewText}</div><div class="note-date">${formatDate(d.timestamp)}</div>`;
            grid.appendChild(card);
        });
    });
}

function formatDate(ts) { if(!ts) return "---"; const d = new Date(ts); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(-2)}`; }
function escapeHTML(str) { if(!str) return ""; return str.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m])); }
function openAddNoteModal() { isEditingNote = false; document.getElementById('form-modal-title').innerText = "Catatan Baru"; document.getElementById('note-title').value = ""; document.getElementById('note-content').value = ""; notesListModal.classList.add('hidden'); noteFormModal.classList.remove('hidden'); history.pushState(null, null, "#noteForm"); }
function openNoteDetailModal(key, data) { selectedNoteKey = key; currentNoteRawContent = data.content; document.getElementById('view-tag').innerText = `Dibuat: ${new Date(data.timestamp).toLocaleDateString()}`; document.getElementById('view-title').value = data.title || "Tanpa Judul"; document.getElementById('view-content').innerText = data.content; notesListModal.classList.add('hidden'); noteDetailModal.classList.remove('hidden'); history.pushState(null, null, "#noteDetail"); }
function closeNoteDetailModal() { noteDetailModal.classList.add('hidden'); notesListModal.classList.remove('hidden'); }
function handleCancelNoteForm() { noteFormModal.classList.add('hidden'); if (isEditingNote) { noteDetailModal.classList.remove('hidden'); } else { notesListModal.classList.remove('hidden'); } }
function editFromDetail() { const t = document.getElementById('view-title').value; const c = currentNoteRawContent; noteDetailModal.classList.add('hidden'); isEditingNote = true; document.getElementById('form-modal-title').innerText = "Edit Catatan"; document.getElementById('note-title').value = (t === "Tanpa Judul") ? "" : t; document.getElementById('note-content').value = c; noteFormModal.classList.remove('hidden'); }

function handleSaveNote() {
    let t = document.getElementById('note-title').value.trim(); const c = document.getElementById('note-content').value;
    if(!c || c.trim() === "") return showToast("Konten tidak boleh kosong!");
    if (!t) {
        db.ref(DB_PATH).once('value').then(snapshot => {
            let usedNumbers = new Set(); snapshot.forEach(child => { let titleStr = child.val().title; if (titleStr && /^\d+$/.test(titleStr.toString().trim())) usedNumbers.add(parseInt(titleStr.toString().trim())); });
            let nextNum = 1; while (usedNumbers.has(nextNum)) { nextNum++; } executeSaveNote(nextNum.toString(), c);
        });
    } else { executeSaveNote(t, c); }
}

function executeSaveNote(title, content) {
    const data = { title: title, content: content, timestamp: Date.now() };
    const promise = (isEditingNote && selectedNoteKey) ? db.ref(`${DB_PATH}/${selectedNoteKey}`).update(data) : db.ref(DB_PATH).push(data);
    promise.then(() => { noteFormModal.classList.add('hidden'); notesListModal.classList.remove('hidden'); isEditingNote = false; showToast("Catatan tersimpan!"); });
}

function confirmDeleteNote() { if(confirm("Hapus catatan ini?")) { db.ref(`${DB_PATH}/${selectedNoteKey}`).remove().then(() => { noteDetailModal.classList.add('hidden'); notesListModal.classList.remove('hidden'); showToast("Catatan dihapus."); }); } }
function copyNoteContent() { copyToClipboard(currentNoteRawContent); }

// ==========================================
// 4. LOAD SERVER & SALDO
// ==========================================
async function fetchBalance() { 
    try { 
        if (balanceDisplay) balanceDisplay.innerText = "Menghitung...";
        const res = await apiCall('/balance'); 
        if (res.success) { if (balanceDisplay) balanceDisplay.innerText = usdFormatter.format(res.data.balance); } 
        else { if (balanceDisplay) balanceDisplay.innerText = "Gagal"; }
    } catch (error) { if (balanceDisplay) balanceDisplay.innerText = "Error"; } 
}

async function loadShopeeIndonesia() {
    try {
        if (productList) productList.innerHTML = '<div class="status-text">Mencari Server...</div>';
        const productsRes = await apiCall(`/catalog/products`);
        if (productsRes.success && productsRes.data.length > 0) {
            availableProducts = productsRes.data; 
            if (productList) productList.innerHTML = ""; 
            if (availableProducts.length > 0) { selectedProductId = availableProducts[0].id; if (btnOrder) btnOrder.disabled = false; }
            availableProducts.forEach(product => {
                const card = document.createElement("div"); card.className = "product-card"; if (selectedProductId === product.id) card.classList.add('selected');
                card.innerHTML = `<div class="product-info"><h4>Server ID: ${product.id}</h4><p>Stok: ${product.available}</p></div><div class="product-price">${usdFormatter.format(product.price)}</div>`;
                card.onclick = () => { document.querySelectorAll('.product-card').forEach(c => c.classList.remove('selected')); card.classList.add('selected'); selectedProductId = product.id; if (btnOrder) btnOrder.disabled = false; };
                if (productList) productList.appendChild(card);
            });
        }
    } catch (error) { if (productList) productList.innerHTML = `<div class="status-text" style="color:red;">Error: ${error.message}</div>`; }
}

// ==========================================
// 5. PESAN BARU
// ==========================================
if (btnOrder) {
    btnOrder.onclick = async () => {
        if (!selectedProductId) return; btnOrder.disabled = true; const originalText = btnOrder.innerText; btnOrder.innerText = "Memproses...";
        try {
            const res = await apiCall('/orders/create', 'POST', { product_id: parseInt(selectedProductId), quantity: 1 });
            if (res.success) {
                const orderData = res.data.orders[0]; const productInfo = availableProducts.find(p => String(p.id) === String(selectedProductId));
                const expiresAtMs = orderData.expires_at ? new Date(orderData.expires_at).getTime() : Date.now() + (20 * 60 * 1000); const createdAtMs = orderData.created_at ? new Date(orderData.created_at).getTime() : Date.now();
                activeOrders.unshift({ id: orderData.id, productId: 'ka', phone: orderData.phone_number, price: orderData.price || orderData.cost || orderData.amount || (productInfo ? productInfo.price : 0), otp: null, status: "ACTIVE", expiresAt: expiresAtMs, cancelUnlockTime: createdAtMs + (120 * 1000), isAutoCanceling: false });
                saveToStorage(); startPollingAndTimer(); fetchBalance(); window.scrollTo({ top: 0, behavior: 'smooth' }); copyToClipboard(orderData.phone_number);
            } else { showToast(`Gagal: ${res.error.message}`); }
        } catch (error) { showToast("Kesalahan jaringan."); } btnOrder.innerText = originalText; btnOrder.disabled = false;
    };
}

// ==========================================
// 6. RENDER KARTU
// ==========================================
function renderOrders() {
    if (activeCount) activeCount.innerText = activeOrders.length;
    if (activeOrders.length === 0) { if (activeOrdersContainer) activeOrdersContainer.innerHTML = '<div class="status-text">Belum ada pesanan aktif.</div>'; return; }
    if (activeOrdersContainer) activeOrdersContainer.innerHTML = "";
    const now = Date.now();
    activeOrders.forEach(order => {
        const card = document.createElement("div"); card.className = "order-card"; card.id = `order-card-${order.id}`; 
        let isSuccess = (order.status === "OTP_RECEIVED" && order.otp); let otpHtml = isSuccess ? `<div class="otp-code">${order.otp}</div>` : `<div class="modern-loader"><span></span><span></span><span></span></div><div class="waiting-text">MENUNGGU SMS</div>`; const passProductId = order.productId ? `'${order.productId}'` : 'null';
        const wait = order.cancelUnlockTime - now; let cancelBtnAttr = ""; let cancelBtnText = "Batalkan"; let actionBtnAttr = ""; let replaceBtnText = '<i class="fas fa-sync-alt"></i> Ganti'; let resendBtnText = '<i class="fas fa-envelope"></i> Ulang'; let finishBtnAttr = "disabled";
        if (isSuccess) { cancelBtnAttr = "disabled"; cancelBtnText = "Sukses"; actionBtnAttr = "disabled"; replaceBtnText = '<i class="fas fa-check"></i>'; resendBtnText = '<i class="fas fa-check"></i>'; finishBtnAttr = ""; } 
        else if (wait > 0 && !order.isAutoCanceling) { const sec = Math.ceil(wait / 1000); cancelBtnAttr = "disabled"; cancelBtnText = `Tunggu ${sec}s`; actionBtnAttr = "disabled"; replaceBtnText = `${sec}s`; resendBtnText = `${sec}s`; } 
        else if (order.isAutoCanceling) { cancelBtnAttr = "disabled"; cancelBtnText = "Memproses..."; actionBtnAttr = "disabled"; }
        
        const displayPrice = (order.price && order.price != 0) ? usdFormatter.format(order.price) : '$ -';
        
        card.innerHTML = `<div class="order-header"><div><span class="order-id-label">#${order.id}</span> <span class="order-price">${displayPrice}</span></div><span class="timer" id="timer-${order.id}">--:--</span></div><div class="phone-row"><span class="phone-number">${order.phone}</span><button class="btn-copy" onclick="copyToClipboard('${order.phone}')">Salin</button></div><div class="otp-display ${isSuccess ? 'success-glow' : ''}">${isSuccess ? '<div class="otp-title">KODE OTP</div>' : ''}${otpHtml}</div><div class="action-buttons-grid"><button class="btn-replace" id="btn-replace-${order.id}" onclick="replaceSpecificOrder('${order.id}', ${passProductId})" ${actionBtnAttr}>${replaceBtnText}</button><button class="btn-resend" id="btn-resend-${order.id}" onclick="resendSpecificOrder('${order.id}')" ${actionBtnAttr}>${resendBtnText}</button><button class="btn-danger" id="btn-cancel-${order.id}" onclick="cancelSpecificOrder('${order.id}')" ${cancelBtnAttr}>${cancelBtnText}</button><button class="btn-success" id="btn-finish-${order.id}" onclick="finishSpecificOrder('${order.id}')" ${finishBtnAttr}>Selesai</button></div>`;
        if (activeOrdersContainer) activeOrdersContainer.appendChild(card);
    });
}

// ==========================================
// 7. TIMER & POLLING (ISOLASI)
// ==========================================
function startPollingAndTimer() {
    if (timerInterval) clearInterval(timerInterval); if (pollingInterval) clearInterval(pollingInterval);
    timerInterval = setInterval(() => {
        const now = Date.now();
        activeOrders.forEach((order, index) => {
            const timeLeft = order.expiresAt - now; const timerElement = document.getElementById(`timer-${order.id}`);
            if (timeLeft <= 0) { activeOrders.splice(index, 1); saveToStorage(); fetchBalance(); return; }
            if (timerElement) { const m = Math.floor((timeLeft / 1000 / 60) % 60); const s = Math.floor((timeLeft / 1000) % 60); timerElement.innerText = `${m < 10 ? '0'+m : m}:${s < 10 ? '0'+s : s}`; }
            if (timeLeft <= 600000 && order.status !== "OTP_RECEIVED" && !order.isAutoCanceling) { order.isAutoCanceling = true; cancelSpecificOrder(order.id, true); }
            const btnCancel = document.getElementById(`btn-cancel-${order.id}`); const btnReplace = document.getElementById(`btn-replace-${order.id}`); const btnResend = document.getElementById(`btn-resend-${order.id}`); const btnFinish = document.getElementById(`btn-finish-${order.id}`);
            if (order.status === "OTP_RECEIVED") { if (btnCancel) { btnCancel.disabled = true; btnCancel.innerText = "Sukses"; } if (btnReplace) { btnReplace.disabled = true; btnReplace.innerHTML = '<i class="fas fa-check"></i>'; } if (btnResend) { btnResend.disabled = true; btnResend.innerHTML = '<i class="fas fa-check"></i>'; } if (btnFinish) btnFinish.disabled = false; } 
            else { const wait = order.cancelUnlockTime - now; if (wait > 0) { const sec = Math.ceil(wait/1000); if (btnCancel) { btnCancel.disabled = true; btnCancel.innerText = `Tunggu ${sec}s`; } if (btnReplace) { btnReplace.disabled = true; btnReplace.innerHTML = `${sec}s`; } if (btnResend) { btnResend.disabled = true; btnResend.innerHTML = `${sec}s`; } } else if (!order.isAutoCanceling) { if (btnCancel) { btnCancel.disabled = false; btnCancel.innerText = "Batalkan"; } if (btnReplace) { btnReplace.disabled = false; btnReplace.innerHTML = '<i class="fas fa-sync-alt"></i> Ganti'; } if (btnResend && !btnResend.innerHTML.includes('loader')) { btnResend.disabled = false; btnResend.innerHTML = '<i class="fas fa-envelope"></i> Ulang'; } } }
        });
        if (activeOrders.length === 0) clearInterval(timerInterval);
    }, 1000);
    pollingInterval = setInterval(async () => {
        if (activeOrders.length === 0) { clearInterval(pollingInterval); return; }
        for (let i = 0; i < activeOrders.length; i++) {
            let order = activeOrders[i]; if (order.status === "OTP_RECEIVED") continue;
            try { 
                const res = await apiCall(`/orders/${order.id}`); 
                if (res.success) { 
                    if (res.data.status === "OTP_RECEIVED") { 
                        activeOrders[i].status = "OTP_RECEIVED"; activeOrders[i].otp = res.data.otp_code; saveToStorage(); 
                    } else if (res.data.status === "CANCELLED" || (res.data.status !== "ACTIVE" && res.data.status !== "PENDING")) { 
                        activeOrders = activeOrders.filter(o => String(o.id) !== String(order.id)); saveToStorage(); fetchBalance(); 
                    } 
                } 
            } catch (e) {}
        }
    }, 5000);
}

// [KODE DIHAPUS] Fungsi syncServerOrders() sengaja dihapus demi privasi masing-masing user.

// ==========================================
// 9. AKSI TOMBOL
// ==========================================
window.replaceSpecificOrder = async function(orderId, productId) {
    const idStr = String(orderId); const btn = document.getElementById(`btn-replace-${idStr}`); 
    if (!productId || productId === 'null') return showToast("Pilih server manual."); 
    if (btn) { btn.disabled = true; btn.innerHTML = '<div class="loader"></div>'; }
    try {
        const c = await apiCall('/orders/cancel', 'POST', { id: idStr });
        if (c.success || (c.error && c.error.code === 'NOT_FOUND')) {
            activeOrders = activeOrders.filter(o => String(o.id) !== idStr); 
            const n = await apiCall('/orders/create', 'POST', { product_id: 'ka', quantity: 1 });
            if (n.success) {
                const od = n.data.orders[0]; const pInfo = availableProducts.find(p => String(p.id) === String(productId)); const finalPrice = od.price || od.cost || (pInfo ? pInfo.price : 0);
                activeOrders.unshift({ id: od.id, productId: 'ka', phone: od.phone_number, price: finalPrice, otp: null, status: "ACTIVE", expiresAt: new Date(od.expires_at).getTime(), cancelUnlockTime: Date.now() + (120*1000), isAutoCanceling: false });
                saveToStorage(); startPollingAndTimer(); fetchBalance(); window.scrollTo({ top: 0, behavior: 'smooth' }); copyToClipboard(od.phone_number); showToast("Nomor diganti!");
            } else { saveToStorage(); fetchBalance(); showToast("Gagal pesan baru."); }
        } else { showToast("Gagal batal lama."); if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-sync-alt"></i> Ganti'; } }
    } catch (e) { showToast("Error Jaringan."); if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-sync-alt"></i> Ganti'; } }
};

window.resendSpecificOrder = async function(orderId) {
    const idStr = String(orderId); const btn = document.getElementById(`btn-resend-${idStr}`); 
    if (btn) { btn.disabled = true; btn.innerHTML = '<div class="loader"></div>'; }
    try {
        const res = await apiCall('/orders/resend', 'POST', { id: idStr });
        if (res.success) { showToast("Meminta ulang SMS..."); setTimeout(() => { const currentBtn = document.getElementById(`btn-resend-${idStr}`); if(currentBtn && !currentBtn.innerHTML.includes('fa-check')) { currentBtn.disabled = false; currentBtn.innerHTML = '<i class="fas fa-envelope"></i> Ulang'; } }, 30000); } 
        else { showToast(res.error ? res.error.message : "Gagal meminta ulang."); if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-envelope"></i> Ulang'; } }
    } catch (e) { showToast("Kesalahan jaringan."); if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-envelope"></i> Ulang'; } }
};

window.cancelSpecificOrder = async function(id, auto = false) {
    const idStr = String(id); const btnCancel = document.getElementById(`btn-cancel-${idStr}`); 
    if (btnCancel) { btnCancel.disabled = true; btnCancel.innerText = "Memproses..."; }
    try { 
        const res = await apiCall('/orders/cancel', 'POST', { id: idStr }); 
        if (res.success || (res.error && res.error.code === 'NOT_FOUND')) { 
            activeOrders = activeOrders.filter(o => String(o.id) !== idStr); saveToStorage(); fetchBalance(); if(auto) showToast("Otomatis batal (waktu sisa 10 menit)"); 
        } else { showToast("Gagal dibatalkan."); if (btnCancel) btnCancel.disabled = false; } 
    } catch (e) { if (btnCancel) btnCancel.disabled = false; }
};

window.finishSpecificOrder = async function(id) {
    const idStr = String(id); const btnFinish = document.getElementById(`btn-finish-${idStr}`); 
    if (btnFinish) { btnFinish.disabled = true; btnFinish.innerText = "Menutup..."; }
    try { await apiCall('/orders/finish', 'POST', { id: idStr }); } catch (e) {} 
    activeOrders = activeOrders.filter(o => String(o.id) !== idStr); saveToStorage();
};

// [DIUBAH] Fungsi syncServerOrders() dihapus dari saat aplikasi dijalankan
async function initMainApp() { if (balanceDisplay) balanceDisplay.innerText = "..."; await loadShopeeIndonesia(); renderOrders(); if (activeOrders.length > 0) startPollingAndTimer(); }

window.onload = () => {
    setAccountViewingStatus(false); history.pushState(null, null, window.location.href);
    initNotesSync();
    const saved = sessionStorage.getItem('hero_savedAccountName'); if (saved) loginAccount(saved); else fetchAccounts();
};
