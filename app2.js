const BASE_URL = "https://hero-sms-proxy.masreno6pro.workers.dev"; 

// 0. KONFIGURASI FIREBASE & SOUND
const notifSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
const firebaseConfig = { apiKey: "AIzaSyD8oux4DDAE8xB5EaQpnlhosUkK3HVlWL0", authDomain: "catatanku-app-ce60b.firebaseapp.com", databaseURL: "https://catatanku-app-ce60b-default-rtdb.asia-southeast1.firebasedatabase.app", projectId: "catatanku-app-ce60b", storageBucket: "catatanku-app-ce60b.firebasestorage.app", messagingSenderId: "291744292263", appId: "1:291744292263:web:ab8d32ba52bc19cbffea82" };
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.database(); const DB_PATH = 'notes/public';

let selectedNoteKey = null; let isEditingNote = false; let currentNoteRawContent = ""; let viewingPresenceRef = null; let activeAccountName = null; let activeOrders = []; let availableProducts = []; let selectedProductId = null; let timerInterval = null; let pollingInterval = null;
const usdFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 3 });

const currentAccountName = document.getElementById('currentAccountName'); const productList = document.getElementById('productList'); const btnOrder = document.getElementById('btnOrder'); const activeOrdersContainer = document.getElementById('activeOrdersContainer'); const activeCount = document.getElementById('activeCount'); const balanceDisplay = document.getElementById('balanceDisplay'); const exitModal = document.getElementById('exitModal'); const notesListModal = document.getElementById('notesListModal'); const noteFormModal = document.getElementById('noteFormModal'); const noteDetailModal = document.getElementById('noteDetailModal'); const notesCountDisplay = document.getElementById('notesCount');

// --- FUNGSI FORMATTING ---
function formatPhoneNumber(phone) {
    if (!phone) return "";
    return String(phone).replace(/(.{4})/g, '$1 ').trim();
}

function formatOTP(otp) {
    if (!otp) return "";
    const otpStr = String(otp);
    if (otpStr.length >= 6) {
        return otpStr.slice(0, 3) + "&nbsp;&nbsp;" + otpStr.slice(3);
    }
    return otpStr;
}
// -------------------------

if (btnOrder) {
    const btnCopyPassword = document.createElement('button'); btnCopyPassword.innerHTML = '<i class="fas fa-copy"></i> Salin Sandi'; btnCopyPassword.className = "btn-primary"; btnCopyPassword.style.backgroundColor = "var(--info-color)";
    btnCopyPassword.onclick = () => copyToClipboard("Aku123.."); btnOrder.parentNode.insertBefore(btnCopyPassword, btnOrder.nextSibling);
}

let isExitModalOpen = false;
window.addEventListener('popstate', (e) => {
    if (!noteFormModal.classList.contains('hidden')) { handleCancelNoteForm(); history.pushState(null, null, window.location.href); }
    else if (!noteDetailModal.classList.contains('hidden')) { closeNoteDetailModal(); history.pushState(null, null, window.location.href); }
    else if (!notesListModal.classList.contains('hidden')) { closeNotesListModal(); history.pushState(null, null, window.location.href); }
    else if (isExitModalOpen) { closeExitModal(); history.pushState(null, null, window.location.href); }
    else { exitModal.classList.remove('hidden'); isExitModalOpen = true; history.pushState(null, null, window.location.href); }
});

function closeExitModal() { exitModal.classList.add('hidden'); isExitModalOpen = false; }
function confirmExit() { setAccountViewingStatus(false); window.close(); if (navigator.app) navigator.app.exitApp(); else if (navigator.device) navigator.device.exitApp(); else window.history.go(-2); }

async function apiCall(endpoint, method = "GET", body = null) {
    const options = { method, headers: { "Content-Type": "application/json", "X-Account-Name": activeAccountName } };
    if (body) options.body = JSON.stringify(body);
    const response = await fetch(`${BASE_URL}${endpoint}`, options); return await response.json();
}

function saveToStorage() { localStorage.setItem(`hero_orders_${activeAccountName}`, JSON.stringify(activeOrders)); updateAccountOrdersStatus(); renderOrders(); }
function showToast(pesan, type = "success") { const t = document.getElementById("toast"); if(!t) return; t.innerHTML = pesan; if (type === "error") { t.style.backgroundColor = "var(--danger-color)"; t.style.color = "#ffffff"; } else { t.style.backgroundColor = "var(--success-color)"; t.style.color = "#ffffff"; } t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 3000); }
function copyToClipboard(t) { if (navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(t).then(() => { showToast("Berhasil disalin!"); }).catch(err => { copyFallback(t); }); } else { copyFallback(t); } }
function copyFallback(t) { const ta = document.createElement("textarea"); ta.value = t; ta.setAttribute('readonly', ''); ta.style.position = "absolute"; ta.style.left = "-9999px"; document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, 99999); try { document.execCommand('copy'); showToast("Berhasil disalin!"); } catch (err) { showToast("Gagal menyalin.", "error"); } document.body.removeChild(ta); }

function setAccountViewingStatus(isViewing) { if (!activeAccountName) return; if (isViewing) { const connectedRef = db.ref('.info/connected'); viewingPresenceRef = db.ref(`presence/${activeAccountName}/is_viewing`); connectedRef.on('value', (snap) => { if (snap.val() === true) { viewingPresenceRef.onDisconnect().set(false); viewingPresenceRef.set(true); } }); } else { if (viewingPresenceRef) { viewingPresenceRef.set(false); viewingPresenceRef.onDisconnect().cancel(); } } }
function updateAccountOrdersStatus() { if (!activeAccountName) return; db.ref(`presence/${activeAccountName}/has_orders`).set(activeOrders.length > 0); }

async function fetchAccounts() { try { const res = await fetch(`${BASE_URL}/api/accounts`); const data = await res.json(); if (data.accounts && data.accounts.length > 0) { loginAccount(data.accounts[0]); } else { if(currentAccountName) currentAccountName.innerText = "Tidak ada akun"; showToast("Tidak ada akun", "error"); } } catch (error) { if(currentAccountName) currentAccountName.innerText = "Error Koneksi"; showToast("Gagal terhubung", "error"); } }
function loginAccount(accountName) { activeAccountName = accountName; if(currentAccountName) currentAccountName.innerText = accountName; setAccountViewingStatus(true); const rawOrders = JSON.parse(localStorage.getItem(`hero_orders_${accountName}`)) || []; activeOrders = rawOrders.filter(o => o.expiresAt > Date.now()); if (rawOrders.length !== activeOrders.length) saveToStorage(); initMainApp(); }

window.openNotesFromAnywhere = function() { if(notesListModal) notesListModal.classList.remove('hidden'); history.pushState(null, null, "#notes"); };
document.addEventListener('click', function(e) { const target = e.target.closest('button'); if (target && (target.id === 'btnOpenNotes' || (target.getAttribute('onclick') || '').includes('btnOpenNotes'))) { e.preventDefault(); e.stopPropagation(); window.openNotesFromAnywhere(); } }, true);
function closeNotesListModal() { notesListModal.classList.add('hidden'); }
function initNotesSync() { const grid = document.getElementById('notes-grid'); if (!grid) return; db.ref(DB_PATH).orderByChild('timestamp').on('value', snapshot => { grid.innerHTML = ''; let items = []; snapshot.forEach(child => { items.push({ key: child.key, ...child.val() }); }); if(notesCountDisplay) notesCountDisplay.innerText = `(${items.length})`; if(items.length === 0) { grid.innerHTML = '<div class="status-text">Belum ada catatan.</div>'; return; } items.reverse().forEach((d) => { const card = document.createElement('div'); card.className = 'note-card'; card.onclick = () => openNoteDetailModal(d.key, d); const previewText = escapeHTML(d.content).replace(/\n/g, ' '); card.innerHTML = `<div class="note-title">${escapeHTML(d.title) || 'Tanpa Judul'}</div><div class="note-preview">${previewText}</div><div class="note-date">${formatDate(d.timestamp)}</div>`; grid.appendChild(card); }); }); }
function formatDate(ts) { if(!ts) return "---"; const d = new Date(ts); const date = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(-2)}`; const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; return `${date} - ${time}`; }
function escapeHTML(str) { if(!str) return ""; return str.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m])); }
function openAddNoteModal() { isEditingNote = false; document.getElementById('form-modal-title').innerText = "Catatan Baru"; document.getElementById('note-title').value = ""; document.getElementById('note-content').value = ""; notesListModal.classList.add('hidden'); noteFormModal.classList.remove('hidden'); history.pushState(null, null, window.location.href); }
function openNoteDetailModal(key, data) { selectedNoteKey = key; currentNoteRawContent = data.content; document.getElementById('view-tag').innerText = `Dibuat: ${formatDate(data.timestamp)}`; document.getElementById('view-title').value = data.title || "Tanpa Judul"; document.getElementById('view-content').innerText = data.content; notesListModal.classList.add('hidden'); noteDetailModal.classList.remove('hidden'); history.pushState(null, null, window.location.href); }
function closeNoteDetailModal() { noteDetailModal.classList.add('hidden'); notesListModal.classList.remove('hidden'); }
function handleCancelNoteForm() { noteFormModal.classList.add('hidden'); if (isEditingNote) { noteDetailModal.classList.remove('hidden'); } else { notesListModal.classList.remove('hidden'); } }
function editFromDetail() { const t = document.getElementById('view-title').value; const c = currentNoteRawContent; noteDetailModal.classList.add('hidden'); isEditingNote = true; document.getElementById('form-modal-title').innerText = "Edit Catatan"; document.getElementById('note-title').value = (t === "Tanpa Judul") ? "" : t; document.getElementById('note-content').value = c; noteFormModal.classList.remove('hidden'); }
function handleSaveNote() { let t = document.getElementById('note-title').value.trim(); const c = document.getElementById('note-content').value.trim(); if(!c || c === "") return showToast("⚠️ Konten tidak boleh kosong!", "error"); db.ref(DB_PATH).once('value').then(snapshot => { let isDuplicate = false; let usedNumbers = new Set(); snapshot.forEach(child => { let exTitle = child.val().title; let exContent = child.val().content; if (exTitle && /^\d+$/.test(exTitle.toString().trim())) { usedNumbers.add(parseInt(exTitle.toString().trim())); } if (exContent && exContent.trim() === c) { if (!isEditingNote || selectedNoteKey !== child.key) { isDuplicate = true; } } }); if (isDuplicate) return showToast("⚠️ Gagal: Catatan sama sudah ada!", "error"); if (!t) { let nextNum = 1; while (usedNumbers.has(nextNum)) { nextNum++; } executeSaveNote(nextNum.toString(), c); } else { executeSaveNote(t, c); } }); }
function executeSaveNote(title, content) { const data = { title: title, content: content, timestamp: Date.now() }; const promise = (isEditingNote && selectedNoteKey) ? db.ref(`${DB_PATH}/${selectedNoteKey}`).update(data) : db.ref(DB_PATH).push(data); promise.then(() => { noteFormModal.classList.add('hidden'); notesListModal.classList.remove('hidden'); isEditingNote = false; showToast("Catatan tersimpan!"); }); }
function confirmDeleteNote() { if(confirm("Hapus catatan ini?")) { db.ref(`${DB_PATH}/${selectedNoteKey}`).remove().then(() => { noteDetailModal.classList.add('hidden'); notesListModal.classList.remove('hidden'); showToast("Catatan dihapus."); }); } }
function copyNoteContent() { copyToClipboard(currentNoteRawContent); }

async function fetchBalance() { try { if (balanceDisplay) balanceDisplay.innerText = "Menghitung..."; const res = await apiCall('/balance'); if (res.success) { if (balanceDisplay) balanceDisplay.innerText = usdFormatter.format(res.data.balance); } else { if (balanceDisplay) balanceDisplay.innerText = "Gagal"; } } catch (error) { if (balanceDisplay) balanceDisplay.innerText = "Error"; } }

async function loadShopeeIndonesia() {
    try {
        if (productList) productList.innerHTML = '<div class="status-text">Mencari Operator...</div>';
        const productsRes = await apiCall(`/catalog/products`);
        if (productsRes.success && productsRes.data.length > 0) {
            let ops = productsRes.data; let anyOp = ops.find(o => o.id === 'any'); if (!anyOp) anyOp = { id: 'any', price: ops[0]?.price || 0, available: 'Acak' };
            let specificOps = ops.filter(o => o.id !== 'any').sort((a, b) => parseFloat(a.price) - parseFloat(b.price));
            availableProducts = [anyOp, ...specificOps.slice(0, 3)]; 
            if (productList) productList.innerHTML = ""; 
            if (availableProducts.length > 0) { selectedProductId = availableProducts[0].id; if (btnOrder) btnOrder.disabled = false; }
            availableProducts.forEach(product => {
                const card = document.createElement("div"); card.className = "product-card"; 
                if (selectedProductId === product.id) card.classList.add('selected');
                const opName = product.id === 'any' ? '⭐ Acak (Semua Operator)' : `📡 ${product.id.toUpperCase()}`;
                const stockLabel = product.available > 1000 ? "1000+" : product.available;
                card.innerHTML = `<div class="product-info"><h4>${opName}</h4><p>Stok: ${stockLabel}</p></div><div class="product-price">${usdFormatter.format(product.price)}</div>`;
                card.onclick = () => { document.querySelectorAll('.product-card').forEach(c => c.classList.remove('selected')); card.classList.add('selected'); selectedProductId = product.id; if (btnOrder) btnOrder.disabled = false; };
                if (productList) productList.appendChild(card);
            });
        } else { if (productList) productList.innerHTML = '<div class="status-text">Stok sedang kosong.</div>'; }
    } catch (error) { if (productList) productList.innerHTML = `<div class="status-text" style="color:var(--danger-color);">Error muat data.</div>`; }
}

function renderOrders() {
    if (activeCount) activeCount.innerText = activeOrders.length;
    if (activeOrders.length === 0) { if (activeOrdersContainer) activeOrdersContainer.innerHTML = '<div class="status-text">Belum ada pesanan aktif.</div>'; return; }
    if (activeOrdersContainer) activeOrdersContainer.innerHTML = "";
    const now = Date.now();

    activeOrders.forEach(order => {
        const card = document.createElement("div"); card.className = "order-card"; card.id = `order-card-${order.id}`;
        const isSuccess = (order.status === "OTP_RECEIVED" && order.otp);
        const displayPrice = (order.price && order.price != 0) ? usdFormatter.format(order.price) : usdFormatter.format(availableProducts[0]?.price || 0);
        const wait = order.cancelUnlockTime - now; 
        
        // FORMAT OTP ditambahkan disini
        let otpHtml = isSuccess ? 
            `<div class="otp-title">KODE OTP</div><div class="otp-code">${formatOTP(order.otp)}</div>` : 
            `<div class="waiting-animation"><div class="dot-pulse"></div><div class="dot-pulse"></div></div><div class="waiting-text">MENUNGGU...</div>`;
            
        let cancelBtnAttr = "disabled"; let replaceBtnAttr = "disabled"; let resendBtnAttr = "disabled"; let finishBtnAttr = "disabled";

        if (isSuccess) { 
            // OTP Masuk: Tombol Selesai aktif, Tombol Ulang DIMATIKAN sementara
            finishBtnAttr = ""; 
            resendBtnAttr = "disabled";
        } else if (wait <= 0 && !order.isAutoCanceling) { 
            // Menunggu OTP (Lewat 2 Menit): Batal & Ganti AKTIF
            cancelBtnAttr = ""; replaceBtnAttr = ""; 
        } else if (order.isAutoCanceling) { 
            cancelBtnAttr = "disabled"; replaceBtnAttr = "disabled"; resendBtnAttr = "disabled"; 
        }
        
        const opTag = order.productId ? (order.productId === 'any' ? 'Acak' : order.productId.toUpperCase()) : '';

        card.innerHTML = `
            <div class="order-header">
                <div class="order-info-left">
                    <span class="order-id-label">#${order.id} ${opTag ? `(${opTag})` : ''}</span> 
                    <span class="order-price">${displayPrice}</span>
                </div>
                <span class="timer" id="timer-${order.id}">--:--</span>
            </div>
            <div class="phone-row">
                <span class="phone-number">${formatPhoneNumber(order.phone)}</span>
                <button class="btn-copy" onclick="copyToClipboard('${order.phone}')"><i class="fas fa-copy"></i></button>
            </div>
            <div class="otp-display ${isSuccess ? 'success-glow' : ''}">${otpHtml}</div>
            <div class="action-buttons-grid">
                <button class="btn-replace" id="btn-replace-${order.id}" onclick="replaceSpecificOrder('${order.id}')" ${replaceBtnAttr}><i class="fas fa-sync-alt"></i> Ganti</button>
                <button class="btn-resend" id="btn-resend-${order.id}" onclick="resendSpecificOrder('${order.id}')" ${resendBtnAttr}><i class="fas fa-envelope"></i> Ulang</button>
                <button class="btn-danger" id="btn-cancel-${order.id}" onclick="cancelSpecificOrder('${order.id}')" ${cancelBtnAttr}><i class="fas fa-times"></i> Batal</button>
                <button class="btn-success" id="btn-finish-${order.id}" onclick="finishSpecificOrder('${order.id}')" ${finishBtnAttr}><i class="fas fa-check"></i> Selesai</button>
            </div>`;
        if (activeOrdersContainer) activeOrdersContainer.appendChild(card);
    });
}

function startPollingAndTimer() {
    if (timerInterval) clearInterval(timerInterval);
    if (pollingInterval) clearInterval(pollingInterval);
    
    timerInterval = setInterval(() => {
        const now = Date.now();
        activeOrders.forEach((o, i) => {
            const left = o.expiresAt - now; const el = document.getElementById(`timer-${o.id}`);
            if (left <= 0) { activeOrders.splice(i, 1); saveToStorage(); fetchBalance(); return; }
            if (el) { const m = Math.floor(left/60000); const s = Math.floor((left%60000)/1000); el.innerText = `${m}:${s<10?'0':''}${s}`; }

            if (left <= 600000 && o.status !== "OTP_RECEIVED" && !o.isAutoCanceling) {
                o.isAutoCanceling = true; cancelSpecificOrder(o.id, true);
            }

            const wait = o.cancelUnlockTime - now;
            const btnCancel = document.getElementById(`btn-cancel-${o.id}`); const btnReplace = document.getElementById(`btn-replace-${o.id}`); const btnResend = document.getElementById(`btn-resend-${o.id}`); 

            if (o.status !== "OTP_RECEIVED" && !o.isAutoCanceling) {
                if (wait <= 0) {
                    if (btnCancel && btnCancel.disabled) btnCancel.disabled = false;
                    if (btnReplace && btnReplace.disabled && !btnReplace.innerHTML.includes('loader')) btnReplace.disabled = false;
                    
                    // KUNCI TOMBOL ULANG TETAP MATI JIKA BELUM OTP
                    if (btnResend && !btnResend.disabled) btnResend.disabled = true;
                } else {
                    if (btnCancel && !btnCancel.disabled) btnCancel.disabled = true;
                    if (btnReplace && !btnReplace.disabled) btnReplace.disabled = true;
                    if (btnResend && !btnResend.disabled) btnResend.disabled = true;
                }
            }
        });
    }, 1000);
    
    pollingInterval = setInterval(async () => {
        if (activeOrders.length === 0) return;
        for(let i=0; i<activeOrders.length; i++) {
            let o = activeOrders[i];
            if (o.status === "OTP_RECEIVED") continue;
            try {
                const res = await apiCall(`/orders/${o.id}`);
                if (res.success && res.data.status === "OTP_RECEIVED") { 
                    notifSound.play().catch(e => console.log("Sound error:", e));
                    activeOrders[i].status = "OTP_RECEIVED"; activeOrders[i].otp = res.data.otp_code; saveToStorage(); 
                } else if (res.success && res.data.status === "CANCELLED") { 
                    activeOrders = activeOrders.filter(ord => String(ord.id) !== String(o.id)); saveToStorage(); fetchBalance(); 
                }
            } catch(e) {}
        }
    }, 5000);
}

if (btnOrder) {
    btnOrder.onclick = async () => {
        btnOrder.disabled = true; const originalText = btnOrder.innerText; btnOrder.innerText = "Memproses...";
        try {
            const res = await apiCall('/orders/create', 'POST', { operator: selectedProductId });
            if (res.success) {
                const o = res.data.orders[0]; const opInfo = availableProducts.find(p => p.id === selectedProductId); const opPrice = opInfo ? opInfo.price : 0;
                activeOrders.unshift({ id: o.id, productId: selectedProductId, phone: o.phone_number, price: opPrice, otp: null, status: "ACTIVE", expiresAt: Date.now() + (20 * 60 * 1000), cancelUnlockTime: Date.now() + 120000, isAutoCanceling: false });
                saveToStorage(); startPollingAndTimer(); fetchBalance(); copyToClipboard(o.phone_number); window.scrollTo({ top: 0, behavior: 'smooth' });
            } else { showToast(res.error.message, "error"); }
        } catch (e) { showToast("Gagal terhubung.", "error"); }
        btnOrder.disabled = false; btnOrder.innerText = originalText;
    };
}

window.replaceSpecificOrder = async function(orderId) {
    const idStr = String(orderId); const oldOrder = activeOrders.find(o => String(o.id) === idStr); const opToUse = oldOrder ? oldOrder.productId : selectedProductId;
    const btn = document.getElementById(`btn-replace-${idStr}`); if (btn) { btn.disabled = true; btn.innerHTML = '<div class="loader"></div>'; }
    try {
        await apiCall('/orders/cancel', 'POST', { id: idStr }); activeOrders = activeOrders.filter(o => String(o.id) !== idStr); 
        const n = await apiCall('/orders/create', 'POST', { operator: opToUse });
        if (n.success) {
            const od = n.data.orders[0]; const opInfo = availableProducts.find(p => p.id === opToUse); const opPrice = opInfo ? opInfo.price : (oldOrder ? oldOrder.price : 0);
            activeOrders.unshift({ id: od.id, productId: opToUse, phone: od.phone_number, price: opPrice, otp: null, status: "ACTIVE", expiresAt: Date.now() + (20 * 60 * 1000), cancelUnlockTime: Date.now() + 120000, isAutoCanceling: false });
            saveToStorage(); startPollingAndTimer(); fetchBalance(); copyToClipboard(od.phone_number); showToast("Nomor diganti!"); window.scrollTo({ top: 0, behavior: 'smooth' });
        } else { saveToStorage(); fetchBalance(); showToast("Gagal pesan baru.", "error"); }
    } catch (e) { showToast("Error.", "error"); if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-sync-alt"></i> Ganti'; } }
};

window.cancelSpecificOrder = async function(id, auto = false) {
    const idStr = String(id); const btnCancel = document.getElementById(`btn-cancel-${idStr}`); 
    if (btnCancel) { btnCancel.disabled = true; btnCancel.innerHTML = '<div class="loader"></div>'; }
    try { await apiCall('/orders/cancel', 'POST', { id: idStr }); activeOrders = activeOrders.filter(o => String(o.id) !== idStr); saveToStorage(); fetchBalance(); if(auto) showToast("Otomatis dibatalkan (Waktu Sisa 10 Menit)", "error"); } catch (e) { if (btnCancel) { btnCancel.disabled = false; btnCancel.innerHTML = '<i class="fas fa-times"></i> Batal'; } }
};

window.finishSpecificOrder = async function(id) {
    const idStr = String(id); const btnFinish = document.getElementById(`btn-finish-${idStr}`); 
    if (btnFinish) { btnFinish.disabled = true; btnFinish.innerHTML = '<div class="loader"></div>'; }
    copyToClipboard("Aku123..");
    try { await apiCall('/orders/finish', 'POST', { id: idStr }); } catch (e) {} 
    activeOrders = activeOrders.filter(o => String(o.id) !== idStr); saveToStorage();
};

window.resendSpecificOrder = async function(orderId) {
    const idStr = String(orderId); const btn = document.getElementById(`btn-resend-${idStr}`); 
    if (btn) { btn.disabled = true; btn.innerHTML = '<div class="loader"></div>'; }
    try {
        const res = await apiCall('/orders/resend', 'POST', { id: idStr });
        if (res.success) { 
            showToast("Meminta kode baru..."); 
            let idx = activeOrders.findIndex(o => String(o.id) === idStr);
            if (idx !== -1) { activeOrders[idx].status = "ACTIVE"; activeOrders[idx].otp = null; saveToStorage(); }
        } 
        else { showToast(res.error ? res.error.message : "Gagal meminta ulang.", "error"); if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-envelope"></i> Ulang'; } }
    } catch (e) { showToast("Kesalahan jaringan.", "error"); if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-envelope"></i> Ulang'; } }
};

async function initMainApp() { fetchBalance(); await loadShopeeIndonesia(); renderOrders(); startPollingAndTimer(); }
window.onload = () => { setAccountViewingStatus(false); history.pushState(null, null, window.location.href); initNotesSync(); fetchAccounts(); };
