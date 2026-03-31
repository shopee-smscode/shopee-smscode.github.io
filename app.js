const BASE_URL = "https://shopee-otp-proxy.masreno6pro.workers.dev"; 

let activeAccountName = null;
let activeOrders = [];
let availableProducts = []; 
let selectedProductId = null;
let timerInterval = null;
let pollingInterval = null;

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

// ==========================================
// 1. SISTEM BACK BUTTON & MODAL KELUAR
// ==========================================
let isExitModalOpen = false;

window.addEventListener('popstate', (e) => {
    if (activeAccountName !== null) {
        logoutAccount();
    } else {
        if (isExitModalOpen) {
            // [PERBAIKAN LOGIKA]
            // Jika modal sedang terbuka dan user menekan Back HP, 
            // maka TUTUP MODAL (Batal), JANGAN keluar aplikasi!
            closeExitModal();
            // Pasang jebakan history lagi agar tidak jebol
            history.pushState(null, null, window.location.href); 
        } else {
            document.getElementById('exitModal').classList.remove('hidden');
            isExitModalOpen = true;
            history.pushState(null, null, window.location.href); 
        }
    }
});

function closeExitModal() {
    document.getElementById('exitModal').classList.add('hidden');
    isExitModalOpen = false;
}

function confirmExit() {
    window.close();
    if (navigator.app) {
        navigator.app.exitApp();
    } else if (navigator.device) {
        navigator.device.exitApp();
    } else {
        window.history.go(-2);
    }
}

function logoutAccount() {
    if (timerInterval) clearInterval(timerInterval);
    if (pollingInterval) clearInterval(pollingInterval);
    
    sessionStorage.removeItem('savedAccountName');
    
    appView.classList.add('hidden');
    accountView.classList.remove('hidden');
    activeAccountName = null;
    fetchAccounts();
    history.pushState(null, null, window.location.href);
}

btnSwitchAccount.onclick = () => {
    logoutAccount();
};

// ==========================================
// 2. FUNGSI MULTI-AKUN
// ==========================================
async function fetchAccounts() {
    try {
        const res = await fetch(`${BASE_URL}/api/accounts`);
        const data = await res.json();
        
        accountListContainer.innerHTML = "";
        
        if (data.accounts && data.accounts.length > 0) {
            data.accounts.forEach(accountName => {
                const card = document.createElement('div');
                card.className = "account-card";
                card.innerHTML = `<div class="account-name">${accountName}</div>`;
                card.onclick = () => loginAccount(accountName);
                accountListContainer.appendChild(card);
            });
        } else {
            accountListContainer.innerHTML = '<div class="status-text">Tidak ada akun ditemukan di Cloudflare.</div>';
        }
    } catch (error) {
        accountListContainer.innerHTML = '<div class="status-text" style="color:red">Gagal terhubung ke Server.</div>';
    }
}

function loginAccount(accountName) {
    activeAccountName = accountName;
    currentAccountName.innerText = accountName;
    
    sessionStorage.setItem('savedAccountName', accountName);
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
    renderOrders(); 
}

// ==========================================
// 3. UI TOOLS (TOAST & COPY)
// ==========================================
function showToast(pesan) {
    const toast = document.getElementById("toast");
    toast.innerText = pesan;
    toast.classList.add("show");
    setTimeout(() => { toast.classList.remove("show"); }, 2500);
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showToast("Nomor berhasil disalin!"); 
    }).catch(err => {
        showToast("Gagal menyalin nomor."); 
    });
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
    } catch (error) {
        balanceDisplay.innerText = "Error";
    }
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
            availableProducts = productsRes.data
                .sort((a, b) => parseFloat(a.price) - parseFloat(b.price))
                .slice(0, 3);
                
            productList.innerHTML = ""; 
            
            availableProducts.forEach(product => {
                const card = document.createElement("div");
                card.className = "product-card";
                
                if (selectedProductId === product.id) {
                    card.classList.add('selected');
                    btnOrder.disabled = false;
                }

                card.innerHTML = `
                    <div class="product-info">
                        <h4>Server ID: ${product.id}</h4>
                        <p>Stok: ${product.available}</p>
                    </div>
                    <div class="product-price">Rp ${product.price}</div>
                `;
                
                card.onclick = () => {
                    document.querySelectorAll('.product-card').forEach(c => c.classList.remove('selected'));
                    card.classList.add('selected');
                    selectedProductId = product.id;
                    btnOrder.disabled = false;
                };
                
                productList.appendChild(card);
            });
        }
    } catch (error) {
        productList.innerHTML = `<div class="status-text" style="color:red;">Error Sistem: ${error.message}</div>`;
    }
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
            const productInfo = availableProducts.find(p => p.id === parseInt(selectedProductId));
            
            const finalPrice = orderData.price || orderData.cost || (productInfo ? productInfo.price : 0);
            
            const expiresAtMs = orderData.expires_at ? new Date(orderData.expires_at).getTime() : Date.now() + (20 * 60 * 1000);
            const createdAtMs = orderData.created_at ? new Date(orderData.created_at).getTime() : Date.now();
            const cancelUnlockMs = createdAtMs + (120 * 1000); 
            
            const newOrder = {
                id: orderData.id,
                phone: orderData.phone_number,
                price: finalPrice,
                otp: null, 
                status: "ACTIVE",
                expiresAt: expiresAtMs,
                cancelUnlockTime: cancelUnlockMs,
                isAutoCanceling: false
            };
            
            activeOrders.unshift(newOrder); 
            saveToStorage();
            startPollingAndTimer(); 
            fetchBalance(); 

            window.scrollTo({ top: 0, behavior: 'smooth' });
            copyToClipboard(newOrder.phone);

        } else {
            showToast(`Gagal: ${res.error.message}`); 
        }
    } catch (error) {
        showToast("Kesalahan jaringan."); 
    }
    
    btnOrder.innerText = originalText;
    btnOrder.disabled = false;
};

// ==========================================
// 6. RENDER KARTU (ANIMASI MODERN & GLOW)
// ==========================================
function renderOrders() {
    activeCount.innerText = activeOrders.length;
    if (activeOrders.length === 0) {
        activeOrdersContainer.innerHTML = '<div class="status-text">Belum ada pesanan aktif.</div>';
        return;
    }

    activeOrdersContainer.innerHTML = "";
    
    activeOrders.forEach(order => {
        const card = document.createElement("div");
        card.className = "order-card";
        card.id = `order-card-${order.id}`; 
        
        let otpHtml = "";
        let isSuccess = (order.status === "OTP_RECEIVED" && order.otp);

        if (isSuccess) {
            otpHtml = `<div class="otp-code" id="otp-${order.id}">${order.otp}</div>`;
        } else {
            otpHtml = `
                <div class="modern-loader">
                    <span></span><span></span><span></span>
                </div>
                <div class="waiting-text">MENUNGGU SMS</div>
            `;
        }

        const displayPrice = order.price ? `Rp ${order.price}` : 'Rp 0';

        card.innerHTML = `
            <div class="order-header">
                <div><span class="order-id-label">#${order.id}</span> <span class="order-price">${displayPrice}</span></div>
                <span class="timer" id="timer-${order.id}">--:--</span>
            </div>
            
            <div class="phone-row">
                <span class="phone-number">${order.phone}</span>
                <button class="btn-copy" onclick="copyToClipboard('${order.phone}')">Salin</button>
            </div>
            
            <div class="bottom-grid">
                <div class="otp-display ${isSuccess ? 'success-glow' : ''}">
                    ${isSuccess ? '<div class="otp-title">KODE OTP</div>' : ''}
                    ${otpHtml}
                </div>
                <div class="action-buttons">
                    <button class="btn-danger" id="btn-cancel-${order.id}" onclick="cancelSpecificOrder(${order.id})">Batalkan</button>
                    <button class="btn-success" id="btn-finish-${order.id}" onclick="finishSpecificOrder(${order.id})" disabled>Selesai</button>
                </div>
            </div>
        `;
        activeOrdersContainer.appendChild(card);
    });
}

// ==========================================
// 7. TIMER, POLLING & AUTO BATAL 1 MENIT
// ==========================================
function startPollingAndTimer() {
    if (timerInterval) clearInterval(timerInterval);
    if (pollingInterval) clearInterval(pollingInterval);

    timerInterval = setInterval(() => {
        const now = Date.now();
        
        activeOrders.forEach((order, index) => {
            const timeLeft = order.expiresAt - now;
            const timerElement = document.getElementById(`timer-${order.id}`);
            const btnCancel = document.getElementById(`btn-cancel-${order.id}`);
            const btnFinish = document.getElementById(`btn-finish-${order.id}`);

            if (timeLeft <= 0) {
                if (timerElement) timerElement.innerText = "00:00";
                activeOrders.splice(index, 1);
                saveToStorage(); fetchBalance(); 
                return; 
            } else {
                const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
                const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);
                if (timerElement) timerElement.innerText = `${minutes < 10 ? '0'+minutes : minutes}:${seconds < 10 ? '0'+seconds : seconds}`;
            }

            if (timeLeft <= 60000 && order.status !== "OTP_RECEIVED" && !order.isAutoCanceling) {
                order.isAutoCanceling = true; 
                cancelSpecificOrder(order.id, true); 
            }

            if (order.status === "OTP_RECEIVED") {
                if (btnCancel) { btnCancel.disabled = true; btnCancel.innerText = "Sukses"; btnCancel.style.backgroundColor = "#e5e7eb"; btnCancel.style.color = "#9ca3af"; }
                if (btnFinish) btnFinish.disabled = false;
            } else {
                if (btnFinish) btnFinish.disabled = true;
                if (btnCancel && !order.isAutoCanceling) {
                    const cancelWaitLeft = order.cancelUnlockTime - now;
                    if (cancelWaitLeft > 0) {
                        btnCancel.disabled = true;
                        btnCancel.innerText = `Tunggu ${Math.ceil(cancelWaitLeft / 1000)}s`;
                    } else {
                        btnCancel.disabled = false;
                        btnCancel.innerText = "Batalkan";
                    }
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
                    const serverStatus = res.data.status;
                    let hasChanged = false;

                    if (serverStatus === "OTP_RECEIVED") {
                        activeOrders[i].status = "OTP_RECEIVED";
                        activeOrders[i].otp = res.data.otp_code;
                        hasChanged = true;
                    } 
                    else if (serverStatus !== "ACTIVE" && serverStatus !== "PENDING") {
                        activeOrders = activeOrders.filter(o => o.id !== order.id);
                        hasChanged = true;
                        fetchBalance(); 
                    }
                    if (hasChanged) saveToStorage();
                }
            } catch (error) {}
        }
    }, 5000);
}

// ==========================================
// 8. PEMULIHAN DATA SERVER
// ==========================================
async function syncServerOrders() {
    try {
        const res = await apiCall('/orders'); 
        
        if (res.success && res.data) {
            let serverOrders = Array.isArray(res.data) ? res.data : (res.data.data || []);
            
            serverOrders = serverOrders.filter(o => o.status === 'ACTIVE' || o.status === 'OTP_RECEIVED' || o.status === 'PENDING');

            if (serverOrders.length > 0) {
                let hasNewOrder = false;
                
                serverOrders.forEach(order => {
                    const existing = activeOrders.find(o => o.id === order.id);
                    if (!existing) {
                        hasNewOrder = true;
                        
                        const syncedPrice = order.price || order.cost || 0;
                        
                        const expiresAtMs = order.expires_at ? new Date(order.expires_at).getTime() : Date.now() + (20 * 60 * 1000);
                        const createdAtMs = order.created_at ? new Date(order.created_at).getTime() : (expiresAtMs - (20 * 60 * 1000));
                        const cancelUnlockMs = createdAtMs + (120 * 1000); 

                        activeOrders.unshift({
                            id: order.id,
                            phone: order.phone_number || order.phone || '-',
                            price: syncedPrice,
                            otp: order.otp_code || null,
                            status: order.status || "ACTIVE",
                            expiresAt: expiresAtMs,
                            cancelUnlockTime: cancelUnlockMs, 
                            isAutoCanceling: false
                        });
                    }
                });

                if (hasNewOrder) {
                    saveToStorage();
                    renderOrders();
                    startPollingAndTimer();
                    fetchBalance();
                    showToast("Pesanan aktif berhasil dipulihkan!");
                }
            }
        }
    } catch (error) {
        console.log("Sinkronisasi gagal:", error);
    }
}

// ==========================================
// 9. AKSI TOMBOL PESANAN
// ==========================================
window.cancelSpecificOrder = async function(orderId, isAuto = false) {
    const btnCancel = document.getElementById(`btn-cancel-${orderId}`);
    if (btnCancel) {
        btnCancel.disabled = true;
        btnCancel.innerText = "Memproses...";
    }

    try {
        const res = await apiCall('/orders/cancel', 'POST', { id: orderId });
        if (res.success || (res.error && res.error.code === 'NOT_FOUND')) {
            activeOrders = activeOrders.filter(order => order.id !== orderId);
            saveToStorage();
            fetchBalance(); 
            if(isAuto) showToast("Otomatis batal (waktu sisa 1 menit)");
        } else {
            showToast(`Gagal dibatalkan.`);
            if (btnCancel) btnCancel.disabled = false;
        }
    } catch (error) {
        if (btnCancel) btnCancel.disabled = false;
    }
}

window.finishSpecificOrder = async function(orderId) {
    const btnFinish = document.getElementById(`btn-finish-${orderId}`);
    if (btnFinish) { btnFinish.disabled = true; btnFinish.innerText = "Menutup..."; }
    try { await apiCall('/orders/finish', 'POST', { id: orderId }); } catch (error) {}
    activeOrders = activeOrders.filter(order => order.id !== orderId);
    saveToStorage();
}

function initMainApp() {
    balanceDisplay.innerText = "Memuat...";
    productList.innerHTML = '<div class="status-text">Memuat data Shopee Indonesia...</div>';
    
    btnOrder.disabled = !selectedProductId; 
    
    fetchBalance(); 
    loadShopeeIndonesia();
    renderOrders();
    
    if (activeOrders.length > 0) {
        startPollingAndTimer();
    }

    syncServerOrders(); 
}

// ==========================================
// INISIALISASI SAAT PERTAMA KALI DIBUKA
// ==========================================
window.onload = () => {
    history.pushState(null, null, window.location.href);

    const savedAccount = sessionStorage.getItem('savedAccountName');
    if (savedAccount) {
        loginAccount(savedAccount);
    } else {
        fetchAccounts();
    }
};