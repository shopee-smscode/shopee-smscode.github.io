// Konfigurasi Utama
const BASE_URL = "https://shopee-otp-proxy.masreno6pro.workers.dev"; 

// Data Global
let activeOrders = JSON.parse(localStorage.getItem('shopee_orders')) || [];
let selectedProductId = null;
let timerInterval = null;
let pollingInterval = null;

// Elemen DOM Global
const productList = document.getElementById('productList');
const btnOrder = document.getElementById('btnOrder');
const activeOrdersContainer = document.getElementById('activeOrdersContainer');

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
    renderOrders(); // Segarkan tampilan setiap kali data disimpan
}

function copyToClipboard(text) {
    // Fungsi khusus untuk menyalin teks ke clipboard HP/Browser
    navigator.clipboard.writeText(text).then(() => {
        alert("Nomor " + text + " berhasil disalin!");
    }).catch(err => {
        alert("Gagal menyalin nomor: ", err);
    });
}

// ==========================================
// FUNGSI 1: MEMUAT PRODUK (Shopee & Indonesia)
// ==========================================

async function loadShopeeIndonesia() {
    try {
        productList.innerHTML = '<div class="status-text">Mencari ID Indonesia...</div>';
        const countriesRes = await apiCall('/catalog/countries');
        const indo = countriesRes.data.find(c => c.name.toLowerCase() === 'indonesia');
        if (!indo) throw new Error("Negara Indonesia tidak ditemukan di server");

        productList.innerHTML = '<div class="status-text">Mencari layanan Shopee...</div>';
        const servicesRes = await apiCall(`/catalog/services?country_id=${indo.id}`);
        const shopee = servicesRes.data.find(s => s.name.toLowerCase().includes('shopee'));
        if (!shopee) throw new Error("Layanan Shopee tidak tersedia saat ini");

        productList.innerHTML = '<div class="status-text">Memuat daftar harga...</div>';
        const productsRes = await apiCall(`/catalog/products?country_id=${indo.id}&platform_id=${shopee.id}`);
        
        if (productsRes.success && productsRes.data.length > 0) {
            productList.innerHTML = ""; // Bersihkan teks loading
            
            productsRes.data.forEach(product => {
                const card = document.createElement("div");
                card.className = "product-card";
                card.innerHTML = `
                    <div class="product-info">
                        <h4>Server ${product.id}</h4>
                        <p>Tersedia: ${product.available} nomor</p>
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
            productList.innerHTML = '<div class="status-text">Maaf, stok nomor Shopee sedang kosong.</div>';
        }
    } catch (error) {
        productList.innerHTML = `<div class="status-text" style="color:red;">Gagal memuat: ${error.message}</div>`;
    }
}

// ==========================================
// FUNGSI 2: MEMESAN NOMOR BARU
// ==========================================

btnOrder.onclick = async () => {
    if (!selectedProductId) return;

    btnOrder.disabled = true;
    const originalText = btnOrder.innerText;
    btnOrder.innerText = "Memproses Pesanan...";

    try {
        const res = await apiCall('/orders/create', 'POST', { 
            product_id: parseInt(selectedProductId), 
            quantity: 1 
        });
        
        if (res.success) {
            const orderData = res.data.orders[0];
            
            // Buat objek pesanan baru
            const newOrder = {
                id: orderData.id,
                phone: orderData.phone_number,
                otp: "-",
                status: "Menunggu SMS",
                // Set waktu kadaluarsa 20 menit (20 * 60 * 1000 milidetik) dari waktu pemesanan
                expiryTime: Date.now() + (20 * 60 * 1000) 
            };
            
            // Masukkan ke array dan simpan ke local storage
            activeOrders.unshift(newOrder); // unshift agar pesanan terbaru ada di paling atas
            saveToStorage();
            startPollingAndTimer(); // Pastikan interval berjalan
        } else {
            alert(`Gagal memesan: ${res.error.message}`);
        }
    } catch (error) {
        alert("Terjadi kesalahan jaringan saat memesan nomor.");
    }
    
    btnOrder.innerText = originalText;
    btnOrder.disabled = false;
};

// ==========================================
// FUNGSI 3: MERENDER (MENAMPILKAN) KARTU PESANAN
// ==========================================

function renderOrders() {
    if (activeOrders.length === 0) {
        activeOrdersContainer.innerHTML = '<div class="status-text">Belum ada pesanan aktif.</div>';
        return;
    }

    activeOrdersContainer.innerHTML = "";
    
    activeOrders.forEach(order => {
        const card = document.createElement("div");
        card.className = "order-card";
        // Menentukan ID elemen (Idempotency) agar spesifik untuk kartu ini
        card.id = `order-card-${order.id}`; 
        
        card.innerHTML = `
            <div class="order-header">
                <span class="order-id-label">ID Pesanan: #${order.id}</span>
                <span class="timer" id="timer-${order.id}">--:--</span>
            </div>
            
            <div class="phone-row">
                <span class="phone-number">${order.phone}</span>
                <button class="btn-copy" onclick="copyToClipboard('${order.phone}')">Salin</button>
            </div>
            
            <div class="status-row">
                <span class="status-label-title">Status Sistem:</span>
                <span class="status-value" id="status-${order.id}">${order.status}</span>
            </div>
            
            <div class="otp-display">
                <div class="otp-title">KODE OTP:</div>
                <div class="otp-code" id="otp-${order.id}">${order.otp}</div>
            </div>
            
            <div class="action-buttons">
                <button class="btn-danger" id="btn-cancel-${order.id}" onclick="cancelSpecificOrder(${order.id})">Batalkan</button>
                <button class="btn-success" id="btn-finish-${order.id}" onclick="finishSpecificOrder(${order.id})">Selesai (Tutup)</button>
            </div>
        `;
        
        activeOrdersContainer.appendChild(card);
        
        // Atur tampilan tombol berdasarkan status
        if (order.status === "OTP_RECEIVED" || order.otp !== "-") {
            document.getElementById(`btn-cancel-${order.id}`).style.display = 'none';
        }
    });
}

// ==========================================
// FUNGSI 4: TIMER 20 MENIT & POLLING OTP BERKALA
// ==========================================

function startPollingAndTimer() {
    // Hentikan interval lama jika ada agar tidak dobel
    if (timerInterval) clearInterval(timerInterval);
    if (pollingInterval) clearInterval(pollingInterval);

    // 1. INTERVAL TIMER (Setiap 1 Detik)
    timerInterval = setInterval(() => {
        const currentTime = Date.now();
        
        activeOrders.forEach((order, index) => {
            const timeLeft = order.expiryTime - currentTime;
            const timerElement = document.getElementById(`timer-${order.id}`);

            if (timeLeft <= 0) {
                // WAKTU HABIS (> 20 Menit)
                if (timerElement) timerElement.innerText = "00:00";
                
                // Batalkan di server (fire and forget)
                apiCall('/orders/cancel', 'POST', { id: order.id }).catch(e => console.log(e));
                
                // Hapus dari array dan storage
                activeOrders.splice(index, 1);
                saveToStorage(); 
            } else {
                // HITUNG MUNDUR NORMAL
                const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
                const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);
                
                // Format agar selalu 2 digit (misal: 09:05)
                const displayMinutes = minutes < 10 ? '0' + minutes : minutes;
                const displaySeconds = seconds < 10 ? '0' + seconds : seconds;
                
                if (timerElement) timerElement.innerText = `${displayMinutes}:${displaySeconds}`;
            }
        });
        
        // Matikan interval jika tidak ada pesanan aktif
        if (activeOrders.length === 0) {
            clearInterval(timerInterval);
        }
    }, 1000);

    // 2. INTERVAL POLLING OTP (Setiap 5 Detik)
    pollingInterval = setInterval(async () => {
        if (activeOrders.length === 0) {
            clearInterval(pollingInterval);
            return;
        }

        // Cek setiap order satu per satu
        for (let i = 0; i < activeOrders.length; i++) {
            let order = activeOrders[i];
            
            // Skip jika OTP sudah masuk (tidak perlu di cek ke server lagi)
            if (order.status === "OTP_RECEIVED" || order.otp !== "-") continue;

            try {
                const res = await apiCall(`/orders/${order.id}`);
                
                if (res.success) {
                    const serverStatus = res.data.status;
                    let hasChanged = false;

                    // Jika status berubah menjadi sukses (OTP Masuk)
                    if (serverStatus === "OTP_RECEIVED") {
                        activeOrders[i].status = "OTP DITERIMA!";
                        activeOrders[i].otp = res.data.otp_code;
                        hasChanged = true;
                    } 
                    // Jika di-cancel atau expired dari sisi server
                    else if (serverStatus === "CANCELED" || serverStatus === "EXPIRED") {
                        // Hapus nomor ini dari array
                        activeOrders = activeOrders.filter(o => o.id !== order.id);
                        hasChanged = true;
                    }

                    // Jika ada perubahan pada order ini, simpan dan render ulang
                    if (hasChanged) saveToStorage();
                }
            } catch (error) {
                console.log(`Gagal mengecek order ${order.id}`);
            }
        }
    }, 5000);
}

// ==========================================
// FUNGSI 5: AKSI TOMBOL PADA KARTU PESANAN
// ==========================================

// Membatalkan Pesanan Khusus
window.cancelSpecificOrder = async function(orderId) {
    const confirmCancel = confirm("Apakah Anda yakin ingin membatalkan pesanan ini? Saldo Anda akan dikembalikan.");
    if (!confirmCancel) return;

    const statusEl = document.getElementById(`status-${orderId}`);
    const btnCancel = document.getElementById(`btn-cancel-${orderId}`);
    
    if (statusEl) statusEl.innerText = "Membatalkan...";
    if (btnCancel) btnCancel.disabled = true;

    try {
        const res = await apiCall('/orders/cancel', 'POST', { id: orderId });
        
        if (res.success || (res.error && res.error.code === 'NOT_FOUND')) {
            // Berhasil dibatalkan, ATAU sudah tidak ada di server
            // Hapus dari memori lokal dan refresh tampilan
            activeOrders = activeOrders.filter(order => order.id !== orderId);
            saveToStorage();
        } else {
            alert(`Gagal membatalkan: ${res.error.message}`);
            if (statusEl) statusEl.innerText = "Gagal Dibatalkan";
            if (btnCancel) btnCancel.disabled = false;
        }
    } catch (error) {
        alert("Terjadi kesalahan jaringan saat membatalkan.");
        if (btnCancel) btnCancel.disabled = false;
    }
}

// Menyelesaikan Pesanan Khusus (MEMBERSIHKAN SEMUANYA)
window.finishSpecificOrder = async function(orderId) {
    // Tombol "Selesai" bertindak untuk membersihkan seluruh riwayat nomor tersebut
    const btnFinish = document.getElementById(`btn-finish-${orderId}`);
    if (btnFinish) btnFinish.disabled = true;

    try {
        // Beritahu server bahwa pesanan selesai agar nomor segera dilepas
        await apiCall('/orders/finish', 'POST', { id: orderId });
    } catch (error) {
        // Tetap lanjutkan pembersihan memori lokal meskipun server error
        console.log("Error menutup pesanan di server, melanjutkan pembersihan lokal.");
    }

    // Hapus pesanan dari memori lokal secara permanen
    activeOrders = activeOrders.filter(order => order.id !== orderId);
    
    // Simpan perubahan ke localStorage dan render ulang UI 
    // (Ini akan otomatis menghilangkan kartu, nomor, dan OTP dari layar)
    saveToStorage();
}

// ==========================================
// INISIALISASI SAAT HALAMAN DIBUKA (AWAL)
// ==========================================
window.onload = () => {
    // 1. Muat daftar harga
    loadShopeeIndonesia();
    
    // 2. Render pesanan yang mungkin tersimpan di memory dari sesi sebelumnya
    renderOrders();
    
    // 3. Jalankan timer dan polling jika ada pesanan aktif
    if (activeOrders.length > 0) {
        startPollingAndTimer();
    }
};
