// Konfigurasi Utama
const BASE_URL = "https://shopee-otp-proxy.masreno6pro.workers.dev"; 

// Data Global
let activeOrders = JSON.parse(localStorage.getItem('shopee_orders')) || [];
let availableProducts = []; // Menyimpan data produk untuk mengambil harga
let selectedProductId = null;
let timerInterval = null;
let pollingInterval = null;

// Elemen DOM Global
const productList = document.getElementById('productList');
const btnOrder = document.getElementById('btnOrder');
const activeOrdersContainer = document.getElementById('activeOrdersContainer');
const activeCount = document.getElementById('activeCount');

// ==========================================
// FUNGSI BANTUAN API & PENYIMPANAN
// ==========================================

async function apiCall(endpoint, method = "GET", body = null) {
    const options = { 
        method: method, 
        headers: { "Content-Type": "application/json" } 
    };
    if (body) {
        options.body = JSON.stringify(body);
    }
    
    const response = await fetch(`${BASE_URL}${endpoint}`, options);
    return await response.json();
}

function saveToStorage() {
    localStorage.setItem('shopee_orders', JSON.stringify(activeOrders));
    renderOrders(); 
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        alert("Nomor " + text + " disalin!");
    }).catch(err => {
        alert("Gagal menyalin nomor.");
    });
}

// ==========================================
// FUNGSI 1: MEMUAT PRODUK
// ==========================================

async function loadShopeeIndonesia() {
    try {
        productList.innerHTML = '<div class="status-text" style="grid-column: span 2;">Mencari Server...</div>';
        
        const countriesRes = await apiCall('/catalog/countries');
        const indo = countriesRes.data.find(c => c.name.toLowerCase() === 'indonesia');
        if (!indo) throw new Error("Negara Indonesia tidak ditemukan");

        const servicesRes = await apiCall(`/catalog/services?country_id=${indo.id}`);
        const shopee = servicesRes.data.find(s => s.name.toLowerCase().includes('shopee'));
        if (!shopee) throw new Error("Layanan Shopee tidak tersedia");

        const productsRes = await apiCall(`/catalog/products?country_id=${indo.id}&platform_id=${shopee.id}`);
        
        if (productsRes.success && productsRes.data.length > 0) {
            availableProducts = productsRes.data; // Simpan untuk referensi harga
            productList.innerHTML = ""; 
            
            availableProducts.forEach(product => {
                const card = document.createElement("div");
                card.className = "product-card";
                card.innerHTML = `
                    <div class="product-info">
                        <h4>Srv ${product.id}</h4>
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
        } else {
            productList.innerHTML = '<div class="status-text" style="grid-column: span 2;">Stok kosong.</div>';
        }
    } catch (error) {
        productList.innerHTML = `<div class="status-text" style="color:red; grid-column: span 2;">Error: ${error.message}</div>`;
    }
}

// ==========================================
// FUNGSI 2: MEMESAN NOMOR (Sinkron Server)
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
            
            // Cari harga dari daftar produk
            const productInfo = availableProducts.find(p => p.id === parseInt(selectedProductId));
            const price = productInfo ? productInfo.price : 0;

            // Waktu dari server (jika ada expires_at dari server, gunakan itu. Jika tidak, tambah 20 menit)
            const expiresAt = orderData.expires_at ? new Date(orderData.expires_at).getTime() : Date.now() + (20 * 60 * 1000);
            
            // Kunci pembatalan selama 2 menit dari waktu sekarang
            const cancelUnlockTime = Date.now() + (120 * 1000); 

            const newOrder = {
                id: orderData.id,
                phone: orderData.phone_number,
                price: price,
                otp: null, // null berarti sedang menunggu
                status: "ACTIVE",
                expiresAt: expiresAt,
                cancelUnlockTime: cancelUnlockTime
            };
            
            activeOrders.unshift(newOrder); 
            saveToStorage();
            startPollingAndTimer(); 
        } else {
            alert(`Gagal: ${res.error.message}`);
        }
    } catch (error) {
        alert("Terjadi kesalahan jaringan.");
    }
    
    btnOrder.innerText = originalText;
    btnOrder.disabled = false;
};

// ==========================================
// FUNGSI 3: MERENDER KARTU (UI Kompak)
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
        
        // Tentukan Tampilan OTP (Menunggu atau Berhasil)
        let otpHtml = "";
        if (order.status === "OTP_RECEIVED" && order.otp) {
            otpHtml = `<div class="otp-code" id="otp-${order.id}">${order.otp}</div>`;
        } else {
            // Animasi Loading
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
// FUNGSI 4: TIMER (TERHUBUNG SERVER) & LOGIKA TOMBOL
// ==========================================

function startPollingAndTimer() {
    if (timerInterval) clearInterval(timerInterval);
    if (pollingInterval) clearInterval(pollingInterval);

    // 1. INTERVAL TIMER (Tiap 1 Detik)
    timerInterval = setInterval(() => {
        const now = Date.now();
        
        activeOrders.forEach((order, index) => {
            const timeLeft = order.expiresAt - now;
            const timerElement = document.getElementById(`timer-${order.id}`);
            const btnCancel = document.getElementById(`btn-cancel-${order.id}`);
            const btnFinish = document.getElementById(`btn-finish-${order.id}`);

            // --- Logika Timer Server ---
            if (timeLeft <= 0) {
                if (timerElement) timerElement.innerText = "00:00";
                // Kadaluarsa: Hapus diam-diam
                activeOrders.splice(index, 1);
                saveToStorage(); 
                return; // Lanjut ke order berikutnya
            } else {
                const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
                const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);
                const displayM = minutes < 10 ? '0' + minutes : minutes;
                const displayS = seconds < 10 ? '0' + seconds : seconds;
                if (timerElement) timerElement.innerText = `${displayM}:${displayS}`;
            }

            // --- Logika Tombol Sesuai Status Server ---
            if (order.status === "OTP_RECEIVED") {
                // OTP Masuk: Tombol Batal MATI, Tombol Selesai HIDUP
                if (btnCancel) {
                    btnCancel.disabled = true;
                    btnCancel.innerText = "Sukses";
                    btnCancel.style.backgroundColor = "#cccccc";
                }
                if (btnFinish) btnFinish.disabled = false;
            } else {
                // OTP Belum Masuk: Tombol Selesai MATI, Tombol Batal dikunci 2 menit awal
                if (btnFinish) btnFinish.disabled = true;
                
                if (btnCancel) {
                    const cancelWaitLeft = order.cancelUnlockTime - now;
                    if (cancelWaitLeft > 0) {
                        // Masih dalam masa tunggu 2 menit
                        btnCancel.disabled = true;
                        const waitSecs = Math.ceil(cancelWaitLeft / 1000);
                        btnCancel.innerText = `Tunggu ${waitSecs}s`;
                    } else {
                        // Kunci pembatalan terbuka
                        btnCancel.disabled = false;
                        btnCancel.innerText = "Batalkan";
                    }
                }
            }
        });
        
        if (activeOrders.length === 0) clearInterval(timerInterval);
    }, 1000);

    // 2. INTERVAL POLLING OTP (Tiap 5 Detik)
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
                    }

                    if (hasChanged) saveToStorage();
                }
            } catch (error) {}
        }
    }, 5000);
}

// ==========================================
// FUNGSI 5: AKSI TOMBOL Batal & Selesai
// ==========================================

window.cancelSpecificOrder = async function(orderId) {
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
        } else {
            alert(`Gagal: ${res.error.message}`);
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

    // Bersihkan dari lokal
    activeOrders = activeOrders.filter(order => order.id !== orderId);
    saveToStorage();
}

// ==========================================
// INISIALISASI
// ==========================================
window.onload = () => {
    loadShopeeIndonesia();
    renderOrders();
    if (activeOrders.length > 0) {
        startPollingAndTimer();
    }
};
