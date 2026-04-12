const BASE_URL = "https://shopee-otp-proxy.masreno6pro.workers.dev"; 

// 0. KONFIGURASI FIREBASE & SOUND
const notifSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
const firebaseConfig = { apiKey: "AIzaSyD8oux4DDAE8xB5EaQpnlhosUkK3HVlWL0", authDomain: "catatanku-app-ce60b.firebaseapp.com", databaseURL: "https://catatanku-app-ce60b-default-rtdb.asia-southeast1.firebasedatabase.app", projectId: "catatanku-app-ce60b", storageBucket: "catatanku-app-ce60b.firebasestorage.app", messagingSenderId: "291744292263", appId: "1:291744292263:web:ab8d32ba52bc19cbffea82" };
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.database(); const DB_PATH = 'notes/public';

let selectedNoteKey = null; let isEditingNote = false; let currentNoteRawContent = ""; let viewingPresenceRef = null; let activeAccountName = null; let activeOrders = []; let availableProducts = []; let selectedProductId = null; let timerInterval = null; let pollingInterval = null;

const currentAccountName = document.getElementById('currentAccountName'); const productList = document.getElementById('productList'); const btnOrder = document.getElementById('btnOrder'); const activeOrdersContainer = document.getElementById('activeOrdersContainer'); const activeCount = document.getElementById('activeCount'); const balanceDisplay = document.getElementById('balanceDisplay'); const exitModal = document.getElementById('exitModal'); const notesListModal = document.getElementById('notesListModal'); const noteFormModal = document.getElementById('noteFormModal'); const noteDetailModal = document.getElementById('noteDetailModal'); const notesCountDisplay = document.getElementById('notesCount');

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

function setAccountViewingStatus(isViewing) { if (!activeAccountName) return; if (isViewing) { const connectedRef = db.ref('.info/connected'); viewingPresenceRef = db.ref(`presence/${activeAccountName}/is_viewing`); connectedRef.on('value', (snap) => { if (snap.val() === true) { viewingPresenceRef.onDisconnect().set(false); viewingPresenceRef.set(true); } }); } else { if (viewingPresenceRef) { viewingPresenceRef.set(false); viewingPresenceRef.onDisconnect().cancel(); } } }
function updateAccountOrdersStatus() { if (!activeAccountName) return; db.ref(`presence/${activeAccountName}/has_orders`).set(activeOrders.length > 0); }

async function fetchAccounts() {
    try {
        const res = await fetch(`${BASE_URL}/api/accounts`); const data = await res.json();
        const accountSwitcher = document.getElementById('accountSwitcher');
        if (data.accounts && data.accounts.length > 0) {
            if (accountSwitcher) {
                accountSwitcher.innerHTML = ''; let hasNomor01 = false;
                data.accounts.forEach(acc => { const opt = document.createElement('option'); opt.value = acc; opt.innerText = `👤 ${acc}`; if (acc === 'nomor_01') hasNomor01 = true; accountSwitcher.appendChild(opt); });
                let defaultAcc = hasNomor01 ? 'nomor_01' : data.accounts[0]; accountSwitcher.value = defaultAcc; loginAccount(defaultAcc);
            } else { loginAccount(data.accounts[0]); }
        } else { if(currentAccountName) currentAccountName.innerText = "Tidak ada akun"; showToast("Tidak ada akun di Server", "error"); }
    } catch (error) { if(currentAccountName) currentAccountName.innerText = "Error Koneksi"; showToast("Gagal terhubung ke Server", "error"); }
}

window.switchAccount = function(accountName) {
    if (activeAccountName === accountName) return;
    if (timerInterval) clearInterval(timerInterval); if (pollingInterval) clearInterval(pollingInterval);
    setAccountViewingStatus(false);
    if (activeOrdersContainer) activeOrdersContainer.innerHTML = '<div class="status-text">Memuat pesanan...</div>';
    if (balanceDisplay) balanceDisplay.innerText = "..."; loginAccount(accountName);
};

function loginAccount(accountName) { activeAccountName = accountName; if (currentAccountName) currentAccountName.innerText = accountName; setAccountViewingStatus(true); const now = Date.now(); const rawOrders = JSON.parse(localStorage.getItem(`orders_${accountName}`)) || []; activeOrders = rawOrders.filter(o => o.expiresAt > now); if (rawOrders.length !== activeOrders.length) saveToStorage(); initMainApp(); }
async function apiCall(endpoint, method = "GET", body = null) { const options = { method: method, headers: { "Content-Type": "application/json", "X-Account-Name": activeAccountName } }; if (body) options.body = JSON.stringify(body); const response = await fetch(`${BASE_URL}${endpoint}`, options); return await response.json(); }
function saveToStorage() { localStorage.setItem(`orders_${activeAccountName}`, JSON.stringify(activeOrders)); updateAccountOrdersStatus(); renderOrders(); }
function showToast(pesan, type = "success") { const toast = document.getElementById("toast"); if (!toast) return; toast.innerHTML = pesan; if (type === "error") { toast.style.backgroundColor = "var(--danger-color)"; toast.style.color = "#ffffff"; } else { toast.style.backgroundColor = "var(--success-color)"; toast.style.color = "#ffffff"; } toast.classList.add("show"); setTimeout(() => { toast.classList.remove("show"); }, 3000); }
function copyToClipboard(text) { if (navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(text).then(() => { showToast("Berhasil disalin!"); }).catch(err => { copyFallback(text); }); } else { copyFallback(text); } }
function copyFallback(text) { const ta = document.createElement("textarea"); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = "absolute"; ta.style.left = "-9999px"; document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, 99999); try { document.execCommand('copy'); showToast("Berhasil disalin!"); } catch (err) { showToast("Gagal menyalin.", "error"); } document.body.removeChild(ta); }

// 3. FUNGSI CATATANKU 
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
function handleSaveNote() { let t = document.getElementById('note-title').value.trim(); const c = document.getElementById('note-content').value.trim(); if(!c || c === "") return showToast("⚠️ Konten tidak boleh kosong!", "error"); db.ref(DB_PATH).once('value').then(snapshot => { let isDuplicate = false; let usedNumbers = new Set(); snapshot.forEach(child => { let existingTitle = child.val().title; let existingContent = child.val().content; if (existingTitle && /^\d+$/.test(existingTitle.toString().trim())) { usedNumbers.add(parseInt(existingTitle.toString().trim())); } if (existingContent && existingContent.trim() === c) { if (!isEditingNote || selectedNoteKey !== child.key) { isDuplicate = true; } } }); if (isDuplicate) return showToast("⚠️ Gagal: Catatan sama sudah ada!", "error"); if (!t) { let nextNum = 1; while (usedNumbers.has(nextNum)) { nextNum++; } executeSaveNote(nextNum.toString(), c); } else { executeSaveNote(t, c); } }); }
function executeSaveNote(title, content) { const data = { title: title, content: content, timestamp: Date.now() }; const promise = (isEditingNote && selectedNoteKey) ? db.ref(`${DB_PATH}/${selectedNoteKey}`).update(data) : db.ref(DB_PATH).push(data); promise.then(() => { noteFormModal.classList.add('hidden'); notesListModal.classList.remove('hidden'); isEditingNote = false; showToast("Catatan tersimpan!"); }); }
function confirmDeleteNote() { if(confirm("Hapus catatan ini?")) { db.ref(`${DB_PATH}/${selectedNoteKey}`).remove().then(() => { noteDetailModal.classList.add('hidden'); notesListModal.classList.remove('hidden'); showToast("Catatan dihapus."); }); } }
function copyNoteContent() { copyToClipboard(currentNoteRawContent); }

// 4. LOAD SERVER & AUTO SELECT HARGA TERMURAH
async function fetchBalance() { try { const res = await apiCall('/balance'); if (res.success) { const formatter = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }); if (balanceDisplay) balanceDisplay.innerText = formatter.format(res.data.balance); } } catch (error) { if (balanceDisplay) balanceDisplay.innerText = "Error"; } }
async function loadShopeeIndonesia() {
    try {
        if (productList) productList.innerHTML = '<div class="status-text">Mencari Server...</div>';
        const countriesRes = await apiCall('/catalog/countries'); const indo = countriesRes.data.find(c => c.name.toLowerCase() === 'indonesia');
        const servicesRes = await apiCall(`/catalog/services?country_id=${indo.id}`); const shopee = servicesRes.data.find(s => s.name.toLowerCase().includes('shopee'));
        const productsRes = await apiCall(`/catalog/products?country_id=${indo.id}&platform_id=${shopee.id}`);
        
        if (productsRes.success && productsRes.data.length > 0) {
            availableProducts = productsRes.data.sort((a, b) => parseFloat(a.price) - parseFloat(b.price)).slice(0, 3);
            if (productList) productList.innerHTML = ""; if (availableProducts.length > 0) { selectedProductId = availableProducts[0].id; if (btnOrder) btnOrder.disabled = false; }
            availableProducts.forEach(product => {
                const card = document.createElement("div"); card.className = "product-card"; if (selectedProductId === product.id) { card.classList.add('selected'); }
                card.innerHTML = `<div class="product-info"><h4>Server ID: ${product.id}</h4><p>Stok: ${product.available}</p></div><div class="product-price">Rp ${product.price}</div>`;
                card.onclick = () => { document.querySelectorAll('.product-card').forEach(c => c.classList.remove('selected')); card.classList.add('selected'); selectedProductId = product.id; if (btnOrder) btnOrder.disabled = false; };
                if (productList) productList.appendChild(card);
            });
        }
    } catch (error) { if (productList) productList.innerHTML = `<div class="status-text" style="color:var(--danger-color);">Error: ${error.message}</div>`; }
}

// 5. PESAN BARU & TOMBOL SALIN SANDI
if (btnOrder) {
    const btnCopyPassword = document.createElement('button'); btnCopyPassword.id = 'btnCopyPassword'; btnCopyPassword.innerHTML = '<i class="fas fa-copy"></i> Salin Sandi';
    btnCopyPassword.className = "btn-primary"; btnCopyPassword.style.backgroundColor = "var(--info-color)";
    btnCopyPassword.onclick = () => { copyToClipboard("Aku123.."); };
    btnOrder.parentNode.insertBefore(btnCopyPassword, btnOrder.nextSibling);

    btnOrder.onclick = async () => {
        if (!selectedProductId) return; btnOrder.disabled = true; const originalText = btnOrder.innerText; btnOrder.innerText = "Memproses...";
        try {
            const res = await apiCall('/orders/create', 'POST', { product_id: parseInt(selectedProductId), quantity: 1 });
            if (res.success) {
                const orderData = res.data.orders[0]; const productInfo = availableProducts.find(p => String(p.id) === String(selectedProductId));
                const expiresAtMs = orderData.expires_at ? new Date(orderData.expires_at).getTime() : Date.now() + (20 * 60 * 1000); const createdAtMs = orderData.created_at ? new Date(orderData.created_at).getTime() : Date.now();
                activeOrders.unshift({ id: orderData.id, productId: parseInt(selectedProductId), phone: orderData.phone_number, price: orderData.price || orderData.cost || orderData.amount || (productInfo ? productInfo.price : 0), otp: null, status: "ACTIVE", expiresAt: expiresAtMs, cancelUnlockTime: createdAtMs + (120 * 1000), isAutoCanceling: false });
                saveToStorage(); startPollingAndTimer(); fetchBalance(); window.scrollTo({ top: 0, behavior: 'smooth' }); copyToClipboard(orderData.phone_number);
            } else { showToast(`Gagal: ${res.error.message}`, "error"); }
        } catch (error) { showToast("Kesalahan jaringan.", "error"); }
        btnOrder.innerText = originalText; btnOrder.disabled = false;
    };
}

// 6. RENDER KARTU DENGAN SMART SAFETY BUTTON
function renderOrders() {
    if (activeCount) activeCount.innerText = activeOrders.length;
    if (activeOrders.length === 0) { if (activeOrdersContainer) activeOrdersContainer.innerHTML = '<div class="status-text">Belum ada pesanan aktif.</div>'; return; }
    if (activeOrdersContainer) activeOrdersContainer.innerHTML = "";
    const now = Date.now();

    activeOrders.forEach(order => {
        const card = document.createElement("div"); card.className = "order-card"; card.id = `order-card-${order.id}`; 
        let isSuccess = (order.status === "OTP_RECEIVED" && order.otp);
        const wait = order.cancelUnlockTime - now;
        
        let otpHtml = isSuccess ? 
            `<div class="otp-title">KODE OTP</div><div class="otp-code">${order.otp}</div>` : 
            `<div class="waiting-animation"><div class="dot-pulse"></div><div class="dot-pulse"></div></div><div class="waiting-text">MENUNGGU...</div>`;
            
        const passProductId = order.productId ? `'${order.productId}'` : 'null';
        
        // --- LOGIKA AKTIVASI TOMBOL AMAN ---
        let cancelBtnAttr = "disabled"; let replaceBtnAttr = "disabled"; let resendBtnAttr = "disabled"; let finishBtnAttr = "disabled";

        if (isSuccess) { 
            // Jika OTP masuk, Selesai dan Ulang aktif
            finishBtnAttr = ""; 
            resendBtnAttr = "";
        } else if (wait <= 0 && !order.isAutoCanceling) { 
            // Jika lewat 2 menit dan belum OTP, Batal dan Ganti aktif
            cancelBtnAttr = ""; replaceBtnAttr = ""; 
        } else if (order.isAutoCanceling) { 
            cancelBtnAttr = "disabled"; replaceBtnAttr = "disabled"; resendBtnAttr = "disabled"; 
        }

        const displayPrice = (order.price && order.price != 0) ? `Rp ${order.price}` : 'Rp -';

        card.innerHTML = `
            <div class="order-header">
                <div class="order-info-left">
                    <span class="order-id-label">#${order.id}</span> 
                    <span class="order-price">${displayPrice}</span>
                </div>
                <span class="timer" id="timer-${order.id}">--:--</span>
            </div>
            <div class="phone-row">
                <span class="phone-number">${order.phone}</span>
                <button class="btn-copy" onclick="copyToClipboard('${order.phone}')"><i class="fas fa-copy"></i></button>
            </div>
            <div class="otp-display ${isSuccess ? 'success-glow' : ''}">${otpHtml}</div>
            <div class="action-buttons-grid">
                <button class="btn-replace" id="btn-replace-${order.id}" onclick="replaceSpecificOrder(${order.id}, ${passProductId})" ${replaceBtnAttr}><i class="fas fa-sync-alt"></i> Ganti</button>
                <button class="btn-resend" id="btn-resend-${order.id}" onclick="resendSpecificOrder(${order.id})" ${resendBtnAttr}><i class="fas fa-envelope"></i> Ulang</button>
                <button class="btn-danger" id="btn-cancel-${order.id}" onclick="cancelSpecificOrder(${order.id})" ${cancelBtnAttr}><i class="fas fa-times"></i> Batal</button>
                <button class="btn-success" id="btn-finish-${order.id}" onclick="finishSpecificOrder(${order.id})" ${finishBtnAttr}><i class="fas fa-check"></i> Selesai</button>
            </div>
        `;
        if (activeOrdersContainer) activeOrdersContainer.appendChild(card);
    });
}

function startPollingAndTimer() {
    if (timerInterval) clearInterval(timerInterval); if (pollingInterval) clearInterval(pollingInterval);
    
    timerInterval = setInterval(() => {
        const now = Date.now();
        activeOrders.forEach((order, index) => {
            const timeLeft = order.expiresAt - now; const timerElement = document.getElementById(`timer-${order.id}`);
            if (timeLeft <= 0) { activeOrders.splice(index, 1); saveToStorage(); fetchBalance(); return; }
            if (timerElement) { const m = Math.floor((timeLeft / 1000 / 60) % 60); const s = Math.floor((timeLeft / 1000) % 60); timerElement.innerText = `${m < 10 ? '0'+m : m}:${s < 10 ? '0'+s : s}`; }

            if (timeLeft <= 600000 && order.status !== "OTP_RECEIVED" && !order.isAutoCanceling) { order.isAutoCanceling = true; cancelSpecificOrder(order.id, true); }

            const wait = order.cancelUnlockTime - now;
            const btnCancel = document.getElementById(`btn-cancel-${order.id}`); const btnReplace = document.getElementById(`btn-replace-${order.id}`); const btnResend = document.getElementById(`btn-resend-${order.id}`); 
            
            if (order.status !== "OTP_RECEIVED" && !order.isAutoCanceling) {
                if (wait <= 0) {
                    if (btnCancel && btnCancel.disabled) btnCancel.disabled = false;
                    if (btnReplace && btnReplace.disabled && !btnReplace.innerHTML.includes('loader')) btnReplace.disabled = false;
                    
                    // KUNCI TOMBOL ULANG TETAP MATI
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
        for (let i = 0; i < activeOrders.length; i++) {
            let order = activeOrders[i]; if (order.status === "OTP_RECEIVED") continue;
            try {
                const res = await apiCall(`/orders/${order.id}`);
                if (res.success) {
                    if (res.data.status === "OTP_RECEIVED") { 
                        notifSound.play().catch(e => console.log("Sound error:", e));
                        activeOrders[i].status = "OTP_RECEIVED"; activeOrders[i].otp = res.data.otp_code; saveToStorage(); 
                    } else if (res.data.status !== "ACTIVE" && res.data.status !== "PENDING") { activeOrders = activeOrders.filter(o => o.id !== order.id); saveToStorage(); fetchBalance(); }
                }
            } catch (e) {}
        }
    }, 3000);
}

async function syncServerOrders() {
    try {
        const res = await apiCall('/orders'); 
        if (res.success && res.data) {
            let serverOrders = Array.isArray(res.data) ? res.data : (res.data.data || []);
            serverOrders = serverOrders.filter(o => o.status === 'ACTIVE' || o.status === 'OTP_RECEIVED' || o.status === 'PENDING');
            serverOrders.forEach(order => {
                if (!activeOrders.find(o => o.id === order.id)) {
                    let syncedPrice = order.price || order.cost || order.amount || 0;
                    if (syncedPrice == 0 && order.product_id && availableProducts.length > 0) { const matchProduct = availableProducts.find(p => String(p.id) === String(order.product_id)); if (matchProduct) syncedPrice = matchProduct.price; }
                    const exp = order.expires_at ? new Date(order.expires_at).getTime() : Date.now() + (20*60*1000);
                    const cTime = order.created_at ? new Date(order.created_at).getTime() : (exp - (20*60*1000));
                    activeOrders.unshift({ id: order.id, productId: order.product_id || order.service_id, phone: order.phone_number || order.phone, price: syncedPrice, otp: order.otp_code, status: order.status, expiresAt: exp, cancelUnlockTime: cTime + (120*1000), isAutoCanceling: false });
                }
            });
            saveToStorage(); startPollingAndTimer(); fetchBalance();
        }
    } catch (e) {}
}

window.replaceSpecificOrder = async function(orderId, productId) {
    const btn = document.getElementById(`btn-replace-${orderId}`); if (!productId || productId === 'null') return showToast("Pilih server manual.", "error"); if (btn) { btn.disabled = true; btn.innerHTML = '<div class="loader"></div>'; }
    try {
        const c = await apiCall('/orders/cancel', 'POST', { id: orderId });
        if (c.success || (c.error && c.error.code === 'NOT_FOUND')) {
            activeOrders = activeOrders.filter(o => o.id !== orderId);
            const n = await apiCall('/orders/create', 'POST', { product_id: parseInt(productId), quantity: 1 });
            if (n.success) {
                const od = n.data.orders[0]; const pInfo = availableProducts.find(p => String(p.id) === String(productId)); const finalPrice = od.price || od.cost || (pInfo ? pInfo.price : 0);
                activeOrders.unshift({ id: od.id, productId: parseInt(productId), phone: od.phone_number, price: finalPrice, otp: null, status: "ACTIVE", expiresAt: new Date(od.expires_at).getTime(), cancelUnlockTime: Date.now() + (120*1000), isAutoCanceling: false });
                saveToStorage(); startPollingAndTimer(); fetchBalance(); window.scrollTo({ top: 0, behavior: 'smooth' }); copyToClipboard(od.phone_number); showToast("Nomor diganti!");
            } else { saveToStorage(); fetchBalance(); showToast("Gagal pesan baru.", "error"); }
        } else { showToast("Gagal batal lama.", "error"); if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-sync-alt"></i> Ganti'; } }
    } catch (e) { showToast("Error Jaringan.", "error"); if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-sync-alt"></i> Ganti'; } }
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

window.cancelSpecificOrder = async function(id, auto = false) {
    const btnCancel = document.getElementById(`btn-cancel-${id}`); if (btnCancel) { btnCancel.disabled = true; btnCancel.innerHTML = '<div class="loader"></div>'; }
    try { const res = await apiCall('/orders/cancel', 'POST', { id: id }); if (res.success || (res.error && res.error.code === 'NOT_FOUND')) { activeOrders = activeOrders.filter(o => o.id !== id); saveToStorage(); fetchBalance(); if(auto) showToast("Otomatis dibatalkan (Waktu Sisa 10 Menit)", "error"); } else { showToast("Gagal dibatalkan.", "error"); if (btnCancel) { btnCancel.disabled = false; btnCancel.innerHTML = '<i class="fas fa-times"></i> Batal'; } } } catch (e) { if (btnCancel) { btnCancel.disabled = false; btnCancel.innerHTML = '<i class="fas fa-times"></i> Batal'; } }
};

window.finishSpecificOrder = async function(id) {
    const btnFinish = document.getElementById(`btn-finish-${id}`); if (btnFinish) { btnFinish.disabled = true; btnFinish.innerHTML = '<div class="loader"></div>'; }
    copyToClipboard("Aku123..");
    try { await apiCall('/orders/finish', 'POST', { id: id }); } catch (e) {} activeOrders = activeOrders.filter(o => o.id !== id); saveToStorage();
};

async function initMainApp() { if (balanceDisplay) balanceDisplay.innerText = "..."; await loadShopeeIndonesia(); renderOrders(); if (activeOrders.length > 0) startPollingAndTimer(); syncServerOrders(); }
window.onload = () => { setAccountViewingStatus(false); history.pushState(null, null, window.location.href); initNotesSync(); fetchAccounts(); };
