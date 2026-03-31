// Konfigurasi Utama
const BASE_URL = "https://shopee-otp-proxy.masreno6pro.workers.dev"; 

// Data Global Multi-Akun
let activeAccountName = null; // Menyimpan NAMA akun yang dipilih

// Data Global Aplikasi Utama
let activeOrders = [];
let availableProducts = []; 
let selectedProductId = null;
let timerInterval = null;
let pollingInterval = null;

// Elemen DOM Lobi Akun
const accountView = document.getElementById('accountView');
const appView = document.getElementById('appView');
const accountListContainer = document.getElementById('accountListContainer');
const btnSwitchAccount = document.getElementById('btnSwitchAccount');
const currentAccountName = document.getElementById('currentAccountName');

// Elemen DOM Aplikasi Utama
const productList = document.getElementById('productList');
const btnOrder = document.getElementById('btnOrder');
const activeOrdersContainer = document.getElementById('activeOrdersContainer');
const activeCount = document.getElementById('activeCount');
const balanceDisplay = document.getElementById('balanceDisplay');

// ==========================================
// FUNGSI MULTI-AKUN (TERHUBUNG CLOUDFLARE)
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
        accountListContainer.innerHTML = '<div class="status-text" style="color:red">Gagal terhubung ke Cloudflare Server.</div>';
    }
}

function loginAccount(accountName) {
    activeAccountName = accountName;
    currentAccountName.innerText = accountName;
    
    // Tampilkan Aplikasi, Sembunyikan Lobi
    accountView.classList.add('hidden');
    appView.classList.remove('hidden');

    // Muat riwayat pesanan khusus untuk akun ini dari lokal HP
    activeOrders = JSON.parse(localStorage.getItem(`orders_${accountName}`)) || [];
    
    initMainApp();
}

btnSwitchAccount.onclick = () => {
    if (timerInterval) clearInterval(timerInterval);
    if (pollingInterval) clearInterval(pollingInterval);
    
    appView.classList.add('hidden');
    accountView.classList.remove('hidden');
    activeAccountName = null;
    fetchAccounts();
};

// ==========================================
// FUNGSI BANTUAN API & PENYIMPANAN
// ==========================================

async function apiCall(endpoint, method = "GET", body = null) {
    const options = { 
        method: method, 
        headers: { 
            "Content-Type": "application/json",
            "X-Account-Name": activeAccountName 
        } 
    };
    if (body) {
        options.body = JSON.stringify(body);
    }
    
    const response = await fetch(`${BASE_URL}${endpoint}`, options);
    return await response.json();
}

function saveToStorage() {
    localStorage.setItem(`orders_${activeAccountName}`, JSON.stringify(activeOrders));
    renderOrders(); 
}

// ==========================================
// FUNGSI UI BARU (TOAST NOTIFIKASI)
// ==========================================
function showToast(pesan) {
    const toast = document.getElementById("toast");
    toast.innerText = pesan;
    toast.classList.add("show");
    
    setTimeout(() => {
        toast.classList.remove("show");
    }, 2500);
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showToast("Nomor " + text + " berhasil disalin!");
    }).catch(err => {
        showToast("Gagal menyalin nomor.");
    });
}

// ==========================================
// FUNGSI SALDO (REAL-TIME)
// ==========================================
async function fetchBalance() {
    try {
        const res = await apiCall('/balance');
        if (res.success) {
            const formatter = new Intl.NumberFormat('id-ID', { 
                style: 'currency', 
                currency: 'IDR', 
                minimumFractionDigits: 0 
            });
            balanceDisplay.innerText = formatter.format(res.data.balance);
        }
    } catch (error) {
        balanceDisplay.innerText = "Error";
    }
}

// ==========================================
// FUNGSI 1: MEMUAT PRODUK
// ==========================================

async function loadShopeeIndonesia() {
    try {
        productList.innerHTML = '<div class="status-text">Mencari Server...</div>';
        
        const countriesRes = await apiCall('/catalog/countries');
        const indo = countriesRes.data.find(c => c.name.toLowerCase() === 'indonesia');
        if (!indo) throw new Error("Negara Indonesia tidak ditemukan");

        const servicesRes = await apiCall(`/catalog/services?country_id=${indo.id}`);
        const shopee = servicesRes.data.find(s => s.name.toLowerCase().includes('shopee'));
        if (!shopee) throw new Error("Layanan Shopee tidak tersedia");

        const productsRes = await apiCall(`/catalog/products?country_id=${indo.id}&platform_id=${shopee.id}`);
        
        if (productsRes.success && productsRes.data.length > 0) {
            availableProducts = productsRes.data; 
            productList.innerHTML = ""; 
            
            availableProducts.forEach(product => {
                const card = document.createElement("div");
                card.className = "product-card";
                card.innerHTML = `
                    <div class="product-info">
                        <h4>Server ID: ${product.id}</h4>
                        <p>Stok Tersedia: ${product.available} Nomor</p>
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
        } else {
            productList.innerHTML = '<div class="status-text">Stok kosong.</div>';
        }
    } catch (error) {
        productList.innerHTML = `<div class="status-text" style="color:red;">Error Sistem: ${error.message}</div>`;
    }
}

// ==========================================
// FUNGSI 2: MEMESAN NOMOR
// ==========================================

btnOrder.onclick = async () => {
    if (!selectedProductId) return;

    btnOrder.disabled = true;
    const originalText = btnOrder.innerText;
    btnOrder.innerText = "Memproses...";

    try {
        const res = await apiCall('/orders/create', 'POST', { 
            product_id: parseInt(selectedProductId), 
            quantity: 1 
        });
        
        if (res.success) {
            const orderData = res.data.orders[0];
            const productInfo = availableProducts.find(p => p.id === parseInt(selectedProductId));
            const price = productInfo ? productInfo.price : 0;

            const expiresAt = orderData.expires_at ? new Date(orderData.expires_at).getTime() : Date.now() + (20 * 60 * 1000);
            const cancelUnlockTime = Date.now() + (120 * 1000); 

            const newOrder = {
                id: orderData.id,
                phone: orderData.phone_number,
                price: price,
                otp: null, 
                status: "ACTIVE",
                expiresAt: expiresAt,
                cancelUnlockTime: cancelUnlockTime
            };
            
            activeOrders.unshift(newOrder); 
            saveToStorage();
            startPollingAndTimer(); 
            fetchBalance(); 
        } else {
            showToast(`Gagal: ${res.error.message}`);
        }
    } catch (error) {
        showToast("Terjadi kesalahan jaringan.");
    }
    
    btnOrder.innerText = originalText;
    btnOrder.disabled = false;
};

// ==========================================
// FUNGSI 3: MERENDER KARTU PESANAN
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
        if (order.status === "OTP_RECEIVED" && order.otp) {
            otpHtml = `<div class="otp-code" id="otp-${order.id}">${order.otp}</div>`;
        } else {
            otpHtml = `
                <div class="loader"></div>
                <div class="waiting-text">Menunggu SMS</div>
            `;
        }

        card.innerHTML = `
            <div class="order-header">
                <div>
                    <span class="order-id-label">#${order.id}</span>
                    <span class="order-price">Rp ${order.price}</span>
                </div>
                <span class="timer" id="timer-${order.id}">--:--</span>
            </div>
            
            <div class="phone-row">
                <span class="phone-number">${order.phone}</span>
                <button class="btn-copy" onclick="copyToClipboard('${order.phone}')">Salin</button>
            </div>
            
            <div class="bottom-grid">
                <div class="otp-display">
                    ${order.status === "OTP_RECEIVED" ? '<div class="otp-title">KODE OTP:</div>' : ''}
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
// FUNGSI 4: TIMER & POLLING SERVER
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
                saveToStorage(); 
                fetchBalance(); 
                return; 
            } else {
                const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
                const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);
                const displayM = minutes < 10 ? '0' + minutes : minutes;
                const displayS = seconds < 10 ? '0' + seconds : seconds;
                if (timerElement) timerElement.innerText = `${displayM}:${displayS}`;
            }

            if (order.status === "OTP_RECEIVED") {
                if (btnCancel) {
                    btnCancel.disabled = true;
                    btnCancel.innerText = "Sukses";
                    btnCancel.style.backgroundColor = "#cccccc";
                }
                if (btnFinish) btnFinish.disabled = false;
            } else {
                if (btnFinish) btnFinish.disabled = true;
                
                if (btnCancel) {
                    const cancelWaitLeft = order.cancelUnlockTime - now;
                    if (cancelWaitLeft > 0) {
                        btnCancel.disabled = true;
                        const waitSecs = Math.ceil(cancelWaitLeft / 1000);
                        btnCancel.innerText = `Tunggu ${waitSecs}s`;
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
        if (activeOrders.length === 0) {
            clearInterval(pollingInterval);
            return;
        }

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
// FUNGSI 5: AKSI TOMBOL
// ==========================================

window.cancelSpecificOrder = async function(orderId) {
    const btnCancel = document.getElementById(`btn-cancel-${orderId}`);
    if (btnCancel) {
        btnCancel.disabled = true;
        btnCancel.innerText = "Proses...";
    }

    try {
        const res = await apiCall('/orders/cancel', 'POST', { id: orderId });
        if (res.success || (res.error && res.error.code === 'NOT_FOUND')) {
            activeOrders = activeOrders.filter(order => order.id !== orderId);
            saveToStorage();
            fetchBalance(); 
        } else {
            showToast(`Gagal Batal: ${res.error.message}`);
            if (btnCancel) btnCancel.disabled = false;
        }
    } catch (error) {
        if (btnCancel) btnCancel.disabled = false;
    }
}

window.finishSpecificOrder = async function(orderId) {
    const btnFinish = document.getElementById(`btn-finish-${orderId}`);
    if (btnFinish) {
        btnFinish.disabled = true;
        btnFinish.innerText = "Menutup...";
    }

    try {
        await apiCall('/orders/finish', 'POST', { id: orderId });
    } catch (error) {}

    activeOrders = activeOrders.filter(order => order.id !== orderId);
    saveToStorage();
}

// ==========================================
// INISIALISASI UTAMA & SCROLL TERBALIK
// ==========================================

function initMainApp() {
    balanceDisplay.innerText = "Memuat...";
    productList.innerHTML = '<div class="status-text">Memuat data Shopee Indonesia...</div>';
    selectedProductId = null;
    btnOrder.disabled = true;
    
    fetchBalance(); 
    loadShopeeIndonesia();
    renderOrders();
    if (activeOrders.length > 0) {
        startPollingAndTimer();
    }
}

window.onload = () => {
    fetchAccounts();
};

// --- LOGIKA SCROLL TERBALIK ---
const btnUp = document.getElementById('btnScrollUp');
const btnDown = document.getElementById('btnScrollDown');

// Tombol Bawah diklik -> scroll layar ke ATAS
btnDown.addEventListener('click', () => {
    window.scrollBy({ top: -300, behavior: 'smooth' }); 
});

// Tombol Atas diklik -> scroll layar ke BAWAH
btnUp.addEventListener('click', () => {
    window.scrollBy({ top: 300, behavior: 'smooth' }); 
});

// Logika untuk mouse wheel terbalik saat diarahkan ke area tombol
const scrollArea = document.getElementById('scrollControls');
scrollArea.addEventListener('wheel', (event) => {
    event.preventDefault(); 
    if (event.deltaY > 0) {
        window.scrollBy({ top: -300, behavior: 'smooth' });
    } else {
        window.scrollBy({ top: 300, behavior: 'smooth' });
    }
}, { passive: false });
