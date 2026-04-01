const BASE_URL = "https://shopee-otp-proxy.masreno6pro.workers.dev"; 

// ==========================================
// 0. KONFIGURASI FIREBASE
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

let selectedNoteKey = null;
let isEditingNote = false;
let currentNoteRawContent = "";

// Referensi Firebase Presence
let viewingPresenceRef = null;
let isPresenceListenerAttached = false;

// Variabel Global OTP
let activeAccountName = null;
let activeOrders = [];
let availableProducts = []; 
let selectedProductId = null;
let timerInterval = null;
let pollingInterval = null;

// DOM Elements OTP
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

// DOM Elements Catatan
const notesListModal = document.getElementById('notesListModal');
const noteFormModal = document.getElementById('noteFormModal');
const noteDetailModal = document.getElementById('noteDetailModal');

// ==========================================
// 1. SISTEM BACK BUTTON & MULTI-MODAL
// ==========================================
let isExitModalOpen = false;

window.addEventListener('popstate', (e) => {
    if (activeAccountName !== null) {
        if (!noteFormModal.classList.contains('hidden')) {
            handleCancelNoteForm();
            history.pushState(null, null, "#sms");
        } else if (!noteDetailModal.classList.contains('hidden')) {
            closeNoteDetailModal();
            history.pushState(null, null, "#sms");
        } else if (!notesListModal.classList.contains('hidden')) {
            closeNotesListModal();
            history.pushState(null, null, "#sms");
        } else {
            logoutAccount();
        }
    } else {
        if (isExitModalOpen) {
            closeExitModal();
            history.pushState(null, null, window.location.href); 
        } else {
            exitModal.classList.remove('hidden');
            isExitModalOpen = true;
            history.pushState(null, null, window.location.href); 
        }
    }
});

function closeExitModal() { exitModal.classList.add('hidden'); isExitModalOpen = false; }
function confirmExit() {
    setAccountViewingStatus(false); // Matikan sensor online saat keluar
    window.close();
    if (navigator.app) navigator.app.exitApp();
    else if (navigator.device) navigator.device.exitApp();
    else window.history.go(-2);
}

function logoutAccount() {
    if (timerInterval) clearInterval(timerInterval);
    if (pollingInterval) clearInterval(pollingInterval);
    
    setAccountViewingStatus(false); // Matikan sensor online akun ini
    
    sessionStorage.removeItem('savedAccountName');
    appView.classList.add('hidden');
    accountView.classList.remove('hidden');
    activeAccountName = null;
    fetchAccounts();
    history.pushState(null, null, window.location.href);
}

btnSwitchAccount.onclick = () => logoutAccount();

// ==========================================
// 2. FUNGSI MULTI-AKUN & REAL-TIME PRESENCE
// ==========================================

// Fungsi 1: Sensor jika akun sedang DIBUKA oleh seseorang
function setAccountViewingStatus(isViewing) {
    if (!activeAccountName) return;
    
    if (isViewing) {
        const connectedRef = db.ref('.info/connected');
        viewingPresenceRef = db.ref(`presence/${activeAccountName}/is_viewing`);
        
        connectedRef.on('value', (snap) => {
            if (snap.val() === true) {
                // Jika koneksi internet terputus / tab ditutup paksa, otomatis false
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

// Fungsi 2: Sensor jika akun SEDANG ADA PESANAN AKTIF
function updateAccountOrdersStatus() {
    if (!activeAccountName) return;
    const hasOrders = activeOrders.length > 0;
    db.ref(`presence/${activeAccountName}/has_orders`).set(hasOrders);
}

// Fungsi 3: Menggambar UI Lobi Berdasarkan Kedua Sensor Di Atas
function syncPresenceUI() {
    if (isPresenceListenerAttached) return;
    isPresenceListenerAttached = true;

    db.ref('presence').on('value', snapshot => {
        const data = snapshot.val() || {};
        
        document.querySelectorAll('.account-card').forEach(card => {
            const accName = card.querySelector('.account-name').innerText;
            const safeId = `status-${accName.replace(/[^a-zA-Z0-9]/g, '-')}`;
            const statusSpan = document.getElementById(safeId);
            
            if (statusSpan) {
                const accData = data[accName] || {};
                // LOGIKA CERDAS: Online jika sedang dibuka ATAU ada pesanan aktif
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
                    <i class="fas fa-chevron-right chevron-icon"></i>
                `;
                card.onclick = () => loginAccount(accountName);
                accountListContainer.appendChild(card);
            });
            
            // Aktifkan pemantau status
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
    currentAccountName.innerText = accountName;
    sessionStorage.setItem('savedAccountName', accountName);
    
    // Setel sensor bahwa akun ini sedang dilihat
    setAccountViewingStatus(true);

    history.pushState(null, null, "#sms"); 
    accountView.classList.add('hidden');
    appView.classList.remove('hidden');

    const now = Date.now();
    const rawOrders = JSON.parse(localStorage.getItem(`orders_${accountName}`)) || [];
    activeOrders = rawOrders.filter(o => o.expiresAt > now);
    if (rawOrders.length !== activeOrders.length) saveToStorage();
    initMainApp();
}

async function apiCall(endpoint, method = "GET", body = null) {
    const options = { 
        method: method, 
        headers: { "Content-Type": "application/json", "X-Account-Name": activeAccountName } 
    };
    if (body) options.body = JSON.stringify(body);
    const response = await fetch(`${BASE_URL}${endpoint}`, options);
    return await response.json();
}

function saveToStorage() {
    localStorage.setItem(`orders_${activeAccountName}`, JSON.stringify(activeOrders));
    updateAccountOrdersStatus(); // Setel sensor setiap ada perubahan pesanan
    renderOrders(); 
}

function showToast(pesan) {
    const toast = document.getElementById("toast");
    toast.innerText = pesan;
    toast.classList.add("show");
    setTimeout(() => { toast.classList.remove("show"); }, 2500);
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showToast("Berhasil disalin!"); 
    }).catch(err => {
        copyFallback(text);
    });
}

function copyFallback(text) {
    const ta = document.createElement("textarea");
    ta.value = text; ta.setAttribute('readonly', ''); 
    ta.style.position = "absolute"; ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select(); ta.setSelectionRange(0, 99999);
    try { document.execCommand('copy'); showToast("Berhasil disalin!"); } 
    catch (err) { showToast("Gagal menyalin."); }
    document.body.removeChild(ta);
}

// ==========================================
// 3. FUNGSI CATATANKU (FIREBASE)
// ==========================================
document.getElementById('btnOpenNotes').onclick = () => {
    notesListModal.classList.remove('hidden');
    history.pushState(null, null, "#notes");
};

function closeNotesListModal() {
    notesListModal.classList.add('hidden');
}

function initNotesSync() {
    const grid = document.getElementById('notes-grid');
    db.ref(DB_PATH).orderByChild('timestamp').on('value', snapshot => {
        grid.innerHTML = '';
        let items = [];
        snapshot.forEach(child => { items.push({ key: child.key, ...child.val() }); });
        
        if(items.length === 0) {
            grid.innerHTML = '<div class="status-text">Belum ada catatan.</div>';
            return;
        }

        items.reverse().forEach((d) => {
            const card = document.createElement('div');
            card.className = 'note-card';
            card.onclick = () => openNoteDetailModal(d.key, d);
            const previewText = escapeHTML(d.content).replace(/\n/g, ' ');
            card.innerHTML = `
                <div class="note-title">${escapeHTML(d.title) || 'Tanpa Judul'}</div>
                <div class="note-preview">${previewText}</div>
                <div class="note-date">${formatDate(d.timestamp)}</div>
            `;
            grid.appendChild(card);
        });
    });
}

function formatDate(ts) {
    if(!ts) return "---";
    const d = new Date(ts);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(-2)}`;
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
    document.getElementById('view-tag').innerText = `Dibuat: ${new Date(data.timestamp).toLocaleDateString()}`;
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
    if (isEditingNote) {
        noteDetailModal.classList.remove('hidden');
    } else {
        notesListModal.classList.remove('hidden');
    }
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
    const c = document.getElementById('note-content').value;
    if(!c || c.trim() === "") return showToast("Konten tidak boleh kosong!");
    
    if (!t) {
        db.ref(DB_PATH).once('value').then(snapshot => {
            let usedNumbers = new Set();
            snapshot.forEach(child => {
                let titleStr = child.val().title;
                if (titleStr && /^\d+$/.test(titleStr.toString().trim())) {
                    usedNumbers.add(parseInt(titleStr.toString().trim()));
                }
            });
            let nextNum = 1;
            while (usedNumbers.has(nextNum)) { nextNum++; }
            executeSaveNote(nextNum.toString(), c);
        });
    } else {
        executeSaveNote(t, c);
    }
}

function executeSaveNote(title, content) {
    const data = { title: title, content: content, timestamp: Date.now() };
    const promise = (isEditingNote && selectedNoteKey) 
        ? db.ref(`${DB_PATH}/${selectedNoteKey}`).update(data)
        : db.ref(DB_PATH).push(data);
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

function copyNoteContent() {
    copyToClipboard(currentNoteRawContent);
}

// ==========================================
// 4. LOAD SERVER
// ==========================================
async function fetchBalance() {
    try {
        const res = await apiCall('/balance');
        if (res.success) {
            const formatter = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 });
            balanceDisplay.innerText = formatter.format(res.data.balance);
        }
    } catch (error) { balanceDisplay.innerText = "Error"; }
}

async function loadShopeeIndonesia() {
    try {
        productList.innerHTML = '<div class="status-text">Mencari Server...</div>';
        const countriesRes = await apiCall('/catalog/countries');
        const indo = countriesRes.data.find(c => c.name.toLowerCase() === 'indonesia');
        const servicesRes = await apiCall(`/catalog/services?country_id=${indo.id}`);
        const shopee = servicesRes.data.find(s => s.name.toLowerCase().includes('shopee'));
        const productsRes = await apiCall(`/catalog/products?country_id=${indo.id}&platform_id=${shopee.id}`);
        
        if (productsRes.success && productsRes.data.length > 0) {
            availableProducts = productsRes.data.sort((a, b) => parseFloat(a.price) - parseFloat(b.price)).slice(0, 3);
            productList.innerHTML = ""; 
            availableProducts.forEach(product => {
                const card = document.createElement("div");
                card.className = "product-card";
                if (selectedProductId === product.id) { card.classList.add('selected'); btnOrder.disabled = false; }
                card.innerHTML = `<div class="product-info"><h4>Server ID: ${product.id}</h4><p>Stok: ${product.available}</p></div><div class="product-price">Rp ${product.price}</div>`;
                card.onclick = () => {
                    document.querySelectorAll('.product-card').forEach(c => c.classList.remove('selected'));
                    card.classList.add('selected');
                    selectedProductId = product.id;
                    btnOrder.disabled = false;
                };
                productList.appendChild(card);
            });
        }
    } catch (error) { productList.innerHTML = `<div class="status-text" style="color:red;">Error: ${error.message}</div>`; }
}

// ==========================================
// 5. PESAN BARU
// ==========================================
btnOrder.onclick = async () => {
    if (!selectedProductId) return;
    btnOrder.disabled = true;
    const originalText = btnOrder.innerText;
    btnOrder.innerText = "Memproses...";
    try {
        const res = await apiCall('/orders/create', 'POST', { product_id: parseInt(selectedProductId), quantity: 1 });
        if (res.success) {
            const orderData = res.data.orders[0];
            const productInfo = availableProducts.find(p => String(p.id) === String(selectedProductId));
            const expiresAtMs = orderData.expires_at ? new Date(orderData.expires_at).getTime() : Date.now() + (20 * 60 * 1000);
            const createdAtMs = orderData.created_at ? new Date(orderData.created_at).getTime() : Date.now();
            
            activeOrders.unshift({
                id: orderData.id,
                productId: parseInt(selectedProductId),
                phone: orderData.phone_number,
                price: orderData.price || orderData.cost || orderData.amount || (productInfo ? productInfo.price : 0),
                otp: null, 
                status: "ACTIVE",
                expiresAt: expiresAtMs,
                cancelUnlockTime: createdAtMs + (120 * 1000),
                isAutoCanceling: false
            });
            saveToStorage(); startPollingAndTimer(); fetchBalance(); 
            window.scrollTo({ top: 0, behavior: 'smooth' });
            copyToClipboard(orderData.phone_number);
        } else { showToast(`Gagal: ${res.error.message}`); }
    } catch (error) { showToast("Kesalahan jaringan."); }
    btnOrder.innerText = originalText;
    btnOrder.disabled = false;
};

// ==========================================
// 6. RENDER KARTU
// ==========================================
function renderOrders() {
    activeCount.innerText = activeOrders.length;
    if (activeOrders.length === 0) { 
        activeOrdersContainer.innerHTML = '<div class="status-text">Belum ada pesanan aktif.</div>'; 
        return; 
    }
    activeOrdersContainer.innerHTML = "";
    const now = Date.now();

    activeOrders.forEach(order => {
        const card = document.createElement("div");
        card.className = "order-card";
        card.id = `order-card-${order.id}`; 
        
        let isSuccess = (order.status === "OTP_RECEIVED" && order.otp);
        let otpHtml = isSuccess ? `<div class="otp-code">${order.otp}</div>` : `<div class="modern-loader"><span></span><span></span><span></span></div><div class="waiting-text">MENUNGGU SMS</div>`;
        const passProductId = order.productId ? `'${order.productId}'` : 'null';

        const wait = order.cancelUnlockTime - now;
        let cancelBtnAttr = "";
        let cancelBtnText = "Batalkan";
        let squareBtnAttr = "";
        let replaceBtnText = '<div style="font-size: 16px; line-height: 1;">↻</div><div style="font-size: 9px; font-weight: 800; margin-top: 3px;">GANTI</div>';
        let finishBtnAttr = "disabled";

        if (isSuccess) {
            cancelBtnAttr = "disabled";
            cancelBtnText = "Sukses";
            squareBtnAttr = "disabled";
            replaceBtnText = '<div style="font-size: 16px;">✓</div>';
            finishBtnAttr = ""; 
        } else if (wait > 0 && !order.isAutoCanceling) {
            const sec = Math.ceil(wait / 1000);
            cancelBtnAttr = "disabled";
            cancelBtnText = `Tunggu ${sec}s`;
            squareBtnAttr = "disabled";
            replaceBtnText = `<div style="font-size: 13px; font-weight: 800;">${sec}s</div>`;
        } else if (order.isAutoCanceling) {
            cancelBtnAttr = "disabled";
            cancelBtnText = "Memproses...";
            squareBtnAttr = "disabled";
        }

        const displayPrice = (order.price && order.price != 0) ? `Rp ${order.price}` : 'Rp -';

        card.innerHTML = `
            <div class="order-header"><div><span class="order-id-label">#${order.id}</span> <span class="order-price">${displayPrice}</span></div><span class="timer" id="timer-${order.id}">--:--</span></div>
            <div class="phone-row"><span class="phone-number">${order.phone}</span><button class="btn-copy" onclick="copyToClipboard('${order.phone}')">Salin</button></div>
            <div class="bottom-grid">
                <div class="otp-display ${isSuccess ? 'success-glow' : ''}">${isSuccess ? '<div class="otp-title">KODE OTP</div>' : ''}${otpHtml}</div>
                <div style="display: flex; gap: 6px;">
                    <button class="btn-replace" id="btn-replace-${order.id}" onclick="replaceSpecificOrder(${order.id}, ${passProductId})" ${squareBtnAttr}>
                        ${replaceBtnText}
                    </button>
                    <div class="action-buttons">
                        <button class="btn-danger" id="btn-cancel-${order.id}" onclick="cancelSpecificOrder(${order.id})" ${cancelBtnAttr}>${cancelBtnText}</button>
                        <button class="btn-success" id="btn-finish-${order.id}" onclick="finishSpecificOrder(${order.id})" ${finishBtnAttr}>Selesai</button>
                    </div>
                </div>
            </div>`;
        activeOrdersContainer.appendChild(card);
    });
}

// ==========================================
// 7. TIMER & AUTO BATAL (10 Menit)
// ==========================================
function startPollingAndTimer() {
    if (timerInterval) clearInterval(timerInterval);
    if (pollingInterval) clearInterval(pollingInterval);
    
    timerInterval = setInterval(() => {
        const now = Date.now();
        activeOrders.forEach((order, index) => {
            const timeLeft = order.expiresAt - now;
            const timerElement = document.getElementById(`timer-${order.id}`);
            if (timeLeft <= 0) { activeOrders.splice(index, 1); saveToStorage(); fetchBalance(); return; }
            if (timerElement) {
                const m = Math.floor((timeLeft / 1000 / 60) % 60);
                const s = Math.floor((timeLeft / 1000) % 60);
                timerElement.innerText = `${m < 10 ? '0'+m : m}:${s < 10 ? '0'+s : s}`;
            }

            if (timeLeft <= 600000 && order.status !== "OTP_RECEIVED" && !order.isAutoCanceling) {
                order.isAutoCanceling = true; cancelSpecificOrder(order.id, true); 
            }

            const btnCancel = document.getElementById(`btn-cancel-${order.id}`);
            const btnReplace = document.getElementById(`btn-replace-${order.id}`);
            const btnFinish = document.getElementById(`btn-finish-${order.id}`);
            
            if (order.status === "OTP_RECEIVED") {
                if (btnCancel) { btnCancel.disabled = true; btnCancel.innerText = "Sukses"; }
                if (btnReplace) { btnReplace.disabled = true; btnReplace.innerHTML = '<div style="font-size: 16px;">✓</div>'; }
                if (btnFinish) btnFinish.disabled = false;
            } else {
                const wait = order.cancelUnlockTime - now;
                if (wait > 0) {
                    const sec = Math.ceil(wait/1000);
                    if (btnCancel) { btnCancel.disabled = true; btnCancel.innerText = `Tunggu ${sec}s`; }
                    if (btnReplace) { btnReplace.disabled = true; btnReplace.innerHTML = `<div style="font-size: 13px; font-weight: 800;">${sec}s</div>`; }
                } else if (!order.isAutoCanceling) {
                    if (btnCancel) { btnCancel.disabled = false; btnCancel.innerText = "Batalkan"; }
                    if (btnReplace) { btnReplace.disabled = false; btnReplace.innerHTML = '<div style="font-size:16px;line-height:1">↻</div><div style="font-size:9px;font-weight:800;margin-top:3px">GANTI</div>'; }
                }
            }
        });
        if (activeOrders.length === 0) clearInterval(timerInterval);
    }, 1000);

    pollingInterval = setInterval(async () => {
        if (activeOrders.length === 0) { clearInterval(pollingInterval); return; }
        for (let i = 0; i < activeOrders.length; i++) {
            let order = activeOrders[i];
            if (order.status === "OTP_RECEIVED") continue;
            try {
                const res = await apiCall(`/orders/${order.id}`);
                if (res.success) {
                    if (res.data.status === "OTP_RECEIVED") {
                        activeOrders[i].status = "OTP_RECEIVED";
                        activeOrders[i].otp = res.data.otp_code;
                        saveToStorage();
                    } else if (res.data.status !== "ACTIVE" && res.data.status !== "PENDING") {
                        activeOrders = activeOrders.filter(o => o.id !== order.id);
                        saveToStorage(); fetchBalance();
                    }
                }
            } catch (e) {}
        }
    }, 5000);
}

// ==========================================
// 8. SYNC DATA SERVER
// ==========================================
async function syncServerOrders() {
    try {
        const res = await apiCall('/orders'); 
        if (res.success && res.data) {
            let serverOrders = Array.isArray(res.data) ? res.data : (res.data.data || []);
            serverOrders = serverOrders.filter(o => o.status === 'ACTIVE' || o.status === 'OTP_RECEIVED' || o.status === 'PENDING');
            serverOrders.forEach(order => {
                if (!activeOrders.find(o => o.id === order.id)) {
                    let syncedPrice = order.price || order.cost || order.amount || 0;
                    if (syncedPrice == 0 && order.product_id && availableProducts.length > 0) {
                        const matchProduct = availableProducts.find(p => String(p.id) === String(order.product_id));
                        if (matchProduct) syncedPrice = matchProduct.price;
                    }
                    const exp = order.expires_at ? new Date(order.expires_at).getTime() : Date.now() + (20*60*1000);
                    const cTime = order.created_at ? new Date(order.created_at).getTime() : (exp - (20*60*1000));
                    activeOrders.unshift({
                        id: order.id, productId: order.product_id || order.service_id, phone: order.phone_number || order.phone, 
                        price: syncedPrice, otp: order.otp_code, status: order.status, 
                        expiresAt: exp, cancelUnlockTime: cTime + (120*1000), isAutoCanceling: false
                    });
                }
            });
            saveToStorage(); startPollingAndTimer(); fetchBalance();
        }
    } catch (e) {}
}

// ==========================================
// 9. AKSI TOMBOL (REPLACE, CANCEL, FINISH)
// ==========================================
window.replaceSpecificOrder = async function(orderId, productId) {
    const btn = document.getElementById(`btn-replace-${orderId}`);
    if (!productId || productId === 'null') return showToast("Pilih server manual.");
    if (btn) { btn.disabled = true; btn.innerHTML = '<div class="loader" style="width:14px;height:14px;border-width:2px"></div>'; }
    try {
        const c = await apiCall('/orders/cancel', 'POST', { id: orderId });
        if (c.success || (c.error && c.error.code === 'NOT_FOUND')) {
            activeOrders = activeOrders.filter(o => o.id !== orderId);
            const n = await apiCall('/orders/create', 'POST', { product_id: parseInt(productId), quantity: 1 });
            if (n.success) {
                const od = n.data.orders[0];
                const pInfo = availableProducts.find(p => String(p.id) === String(productId));
                const finalPrice = od.price || od.cost || (pInfo ? pInfo.price : 0);
                activeOrders.unshift({
                    id: od.id, productId: parseInt(productId), phone: od.phone_number, price: finalPrice,
                    otp: null, status: "ACTIVE", expiresAt: new Date(od.expires_at).getTime(),
                    cancelUnlockTime: Date.now() + (120*1000), isAutoCanceling: false
                });
                saveToStorage(); startPollingAndTimer(); fetchBalance();
                window.scrollTo({ top: 0, behavior: 'smooth' });
                copyToClipboard(od.phone_number);
                showToast("Nomor diganti!");
            } else { saveToStorage(); fetchBalance(); showToast("Gagal pesan baru."); }
        } else {
            showToast("Gagal batal lama.");
            if (btn) { btn.disabled = false; btn.innerHTML = '<div style="font-size:16px;line-height:1">↻</div><div style="font-size:9px;font-weight:800;margin-top:3px">GANTI</div>'; }
        }
    } catch (e) { 
        showToast("Error Jaringan."); 
        if (btn) { btn.disabled = false; btn.innerHTML = '<div style="font-size:16px;line-height:1">↻</div><div style="font-size:9px;font-weight:800;margin-top:3px">GANTI</div>'; }
    }
};

window.cancelSpecificOrder = async function(id, auto = false) {
    const btnCancel = document.getElementById(`btn-cancel-${id}`);
    if (btnCancel) { btnCancel.disabled = true; btnCancel.innerText = "Memproses..."; }
    try {
        const res = await apiCall('/orders/cancel', 'POST', { id: id });
        if (res.success || (res.error && res.error.code === 'NOT_FOUND')) {
            activeOrders = activeOrders.filter(o => o.id !== id);
            saveToStorage(); fetchBalance();
            if(auto) showToast("Otomatis batal (waktu sisa 10 menit)");
        } else {
            showToast("Gagal dibatalkan.");
            if (btnCancel) btnCancel.disabled = false;
        }
    } catch (e) {
        if (btnCancel) btnCancel.disabled = false;
    }
};

window.finishSpecificOrder = async function(id) {
    const btnFinish = document.getElementById(`btn-finish-${id}`);
    if (btnFinish) { btnFinish.disabled = true; btnFinish.innerText = "Menutup..."; }
    try { await apiCall('/orders/finish', 'POST', { id: id }); } catch (e) {}
    activeOrders = activeOrders.filter(o => o.id !== id);
    saveToStorage();
};

async function initMainApp() {
    balanceDisplay.innerText = "...";
    await loadShopeeIndonesia();
    renderOrders();
    if (activeOrders.length > 0) startPollingAndTimer();
    syncServerOrders();
    
    // Inisialisasi Firebase Database untuk catatan
    initNotesSync();
}

window.onload = () => {
    history.pushState(null, null, window.location.href);
    const saved = sessionStorage.getItem('savedAccountName');
    if (saved) loginAccount(saved); else fetchAccounts();
};