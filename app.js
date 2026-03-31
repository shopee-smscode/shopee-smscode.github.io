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
// 1. SISTEM BACK BUTTON & MODAL
// ==========================================
window.addEventListener('popstate', (e) => {
    if (activeAccountName !== null) {
        // Jika sedang di page SMS, logout dan kembali ke Lobi
        logoutAccount();
    } else {
        // Jika di page Lobi, munculkan modal keluar dan jebak tombol back
        document.getElementById('exitModal').classList.remove('hidden');
        history.pushState({ page: 'lobi' }, "", ""); 
    }
});

function closeExitModal() {
    document.getElementById('exitModal').classList.add('hidden');
}

function confirmExit() {
    window.close();       // Tutup web
    window.history.go(-2); // Fallback ke home device jika dibuka dari app/webview
}

function logoutAccount() {
    if (timerInterval) clearInterval(timerInterval);
    if (pollingInterval) clearInterval(pollingInterval);
    
    sessionStorage.removeItem('savedAccountName');
    
    appView.classList.add('hidden');
    accountView.classList.remove('hidden');
    activeAccountName = null;
    fetchAccounts();
}

btnSwitchAccount.onclick = () => {
    logoutAccount();
    history.replaceState({ page: 'lobi' }, "", "");
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
    history.pushState({ page: 'sms' }, "", "#sms"); // Set state HP
    
    accountView.classList.add('hidden');
    appView.classList.remove('hidden');

    activeOrders = JSON.parse(localStorage.getItem(`orders_${accountName}`)) || [];
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
// 4. LOAD SERVER (TOP 3 & FOKUS SELEKSI)
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
            // Urutkan dari termurah, dan potong hanya 3 teratas
            availableProducts = productsRes.data
                .sort((a, b) => parseFloat(a.price) - parseFloat(b.price))
                .slice(0, 3);
                
            productList.innerHTML = ""; 
            
            availableProducts.forEach(product => {
                const card = document.createElement("div");
                card.className = "product-card";
                
                // Jika server ini yang sebelumnya dipilih, kembalikan border merahnya
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
// 5. PESAN BARU (AUTO SCROLL & AUTO COPY)
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
            
            const newOrder = {
                id: orderData.id,
                phone: orderData.phone_number,
                price: productInfo ? productInfo.price : 0,
                otp: null, 
                status: "ACTIVE",
                expiresAt: orderData.expires_at ? new Date(orderData.expires_at).getTime() : Date.now() + (20 * 60 * 1000),
                cancelUnlockTime: Date.now() + (120 * 1000),
                isAutoCanceling: false
            };
            
            activeOrders.unshift(newOrder); 
            saveToStorage();
            startPollingAndTimer(); 
            fetchBalance(); 

            // Auto Scroll ke atas & Auto copy
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
// 6. RENDER KARTU (EFEK GLOW RGB)
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
            otpHtml = `<div class="loader"></div><div class="waiting-text">Menunggu SMS</div>`;
        }

        // Tambahkan class 'success-glow' untuk animasi mutar jika OTP didapat
        card.innerHTML = `
            <div class="order-header">
                <div><span class="order-id-label">#${order.id}</span> <span class="order-price">Rp ${order.price}</span></div>
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
// 7. TIMER & AUTO BATAL (<= 1 MENIT)
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

            // [FITUR BARU] AUTO BATAL JIKA WAKTU TINGGAL 1 MENIT (60 Detik)
            if (timeLeft <= 60000 && order.status !== "OTP_RECEIVED" && !order.isAutoCanceling) {
                order.isAutoCanceling = true; 
                cancelSpecificOrder(order.id, true); // true = auto batal
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
                    else if (serverStatus === "CANCELED" || serverStatus === "EXPIRED") {
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
// 8. AKSI TOMBOL PESANAN
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
    
    // Jangan reset selectedProductId agar highlight merahnya tetap bertahan saat di-render ulang!
    btnOrder.disabled = !selectedProductId; 
    
    fetchBalance(); 
    loadShopeeIndonesia();
    renderOrders();
    if (activeOrders.length > 0) startPollingAndTimer();
}

// ==========================================
// INISIALISASI SAAT PERTAMA KALI DIBUKA
// ==========================================
window.onload = () => {
    history.replaceState({ page: 'lobi' }, "", "");
    // Menggunakan sessionStorage agar login reset ketika aplikasi/tab di close bersih
    const savedAccount = sessionStorage.getItem('savedAccountName');
    
    if (savedAccount) {
        loginAccount(savedAccount);
    } else {
        fetchAccounts();
    }
};
