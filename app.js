// URL Worker Cloudflare yang sudah diperbarui
const BASE_URL = "https://shopee-otp-proxy.masreno6pro.workers.dev"; 

let currentOrderId = null;
let pollingInterval = null;
let selectedProductId = null; // Menyimpan ID produk yang dipilih dari kartu

// Elemen DOM
const productList = document.getElementById('productList');
const btnOrder = document.getElementById('btnOrder');
const statusArea = document.getElementById('statusArea');
const displayNumber = document.getElementById('displayNumber');
const displayStatus = document.getElementById('displayStatus');
const displayOtp = document.getElementById('displayOtp');
const btnCancel = document.getElementById('btnCancel');
const btnFinish = document.getElementById('btnFinish');

async function apiCall(endpoint, method = "GET", body = null) {
    const options = { 
        method: method, 
        headers: { "Content-Type": "application/json" } 
    };
    if (body) options.body = JSON.stringify(body);
    
    // Memanggil proxy Cloudflare Worker
    const response = await fetch(`${BASE_URL}${endpoint}`, options);
    return await response.json();
}

// Fungsi: Pencarian ID Otomatis & Merakit Antarmuka Kartu
async function loadShopeeIndonesia() {
    try {
        productList.innerHTML = '<div class="status-text">Mencari ID Indonesia...</div>';
        const countriesRes = await apiCall('/catalog/countries');
        
        // Mencari objek negara Indonesia
        const indo = countriesRes.data.find(c => c.name.toLowerCase() === 'indonesia');
        if (!indo) throw new Error("Negara Indonesia tidak ditemukan di server");

        productList.innerHTML = '<div class="status-text">Mencari layanan Shopee...</div>';
        const servicesRes = await apiCall(`/catalog/services?country_id=${indo.id}`);
        
        // Mencari layanan Shopee secara dinamis
        const shopee = servicesRes.data.find(s => s.name.toLowerCase().includes('shopee'));
        if (!shopee) throw new Error("Layanan Shopee tidak tersedia saat ini");

        productList.innerHTML = '<div class="status-text">Memuat daftar harga...</div>';
        const productsRes = await apiCall(`/catalog/products?country_id=${indo.id}&platform_id=${shopee.id}`);
        
        if (productsRes.success && productsRes.data.length > 0) {
            productList.innerHTML = ""; // Bersihkan status teks
            
            productsRes.data.forEach(product => {
                // Membuat elemen kartu produk
                const card = document.createElement("div");
                card.className = "product-card";
                card.innerHTML = `
                    <div class="product-info">
                        <h4>Server ${product.id}</h4>
                        <p>Tersedia: ${product.available} nomor</p>
                    </div>
                    <div class="product-price">Rp ${product.price}</div>
                `;
                
                // Logika pemilihan kartu
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
        productList.innerHTML = `<div class="status-text" style="color:red;">Gagal: ${error.message}</div>`;
    }
}

// Fungsi: Memesan Nomor Baru
async function orderNumber() {
    if (!selectedProductId) return;

    btnOrder.disabled = true;
    statusArea.classList.remove('hidden');
    displayStatus.innerText = "Memproses pesanan nomor...";
    displayNumber.innerText = "-";
    displayOtp.innerText = "-";

    try {
        const res = await apiCall('/orders/create', 'POST', { 
            product_id: parseInt(selectedProductId), 
            quantity: 1 
        });
        
        if (res.success) {
            const order = res.data.orders[0];
            currentOrderId = order.id;
            
            displayNumber.innerText = order.phone_number;
            displayStatus.innerText = "Nomor siap! Menunggu SMS masuk...";
            btnCancel.classList.remove('hidden');
            btnFinish.classList.add('hidden');
            
            // Mulai mengecek status OTP secara berkala
            startPolling(); 
        } else {
            displayStatus.innerText = `Error: ${res.error.message}`;
            btnOrder.disabled = false;
        }
    } catch (error) {
        displayStatus.innerText = "Terjadi kesalahan jaringan.";
        btnOrder.disabled = false;
    }
}

// Fungsi: Polling (Cek Status OTP setiap 5 detik)
function startPolling() {
    if (pollingInterval) clearInterval(pollingInterval);
    
    pollingInterval = setInterval(async () => {
        if (!currentOrderId) return;
        try {
            const res = await apiCall(`/orders/${currentOrderId}`);
            if (res.success) {
                const orderStatus = res.data.status;
                
                if (orderStatus === "OTP_RECEIVED") {
                    displayStatus.innerText = "SUKSES! OTP DITERIMA";
                    displayOtp.innerText = res.data.otp_code;
                    clearInterval(pollingInterval);
                    btnCancel.classList.add('hidden');
                    btnFinish.classList.remove('hidden');
                } else if (orderStatus === "CANCELED" || orderStatus === "EXPIRED") {
                    displayStatus.innerText = `Status: ${orderStatus}`;
                    clearInterval(pollingInterval);
                    btnCancel.classList.add('hidden');
                    btnOrder.disabled = false;
                }
            }
        } catch (error) {
            // Error polling biasanya karena masalah jaringan sementara
        }
    }, 5000); 
}

// Fungsi: Membatalkan Pesanan
async function cancelOrder() {
    if (!currentOrderId) return;
    displayStatus.innerText = "Membatalkan pesanan...";
    try {
        const res = await apiCall('/orders/cancel', 'POST', { id: currentOrderId });
        if (res.success) {
            clearInterval(pollingInterval);
            displayStatus.innerText = "Dibatalkan. Saldo telah dikembalikan.";
            btnCancel.classList.add('hidden');
            btnOrder.disabled = false;
            currentOrderId = null;
        }
    } catch (error) {
        displayStatus.innerText = "Gagal membatalkan.";
    }
}

// Fungsi: Menyelesaikan Pesanan
async function finishOrder() {
     if (!currentOrderId) return;
     displayStatus.innerText = "Menutup pesanan...";
     try {
         const res = await apiCall('/orders/finish', 'POST', { id: currentOrderId });
         if (res.success) {
             displayStatus.innerText = "Pesanan selesai.";
             btnFinish.classList.add('hidden');
             btnOrder.disabled = false;
             currentOrderId = null;
         }
     } catch (error) {
         displayStatus.innerText = "Error saat menutup pesanan.";
     }
}

// Hubungkan tombol dengan fungsinya
btnOrder.addEventListener('click', orderNumber);
btnCancel.addEventListener('click', cancelOrder);
btnFinish.addEventListener('click', finishOrder);

// Jalankan pencarian produk saat halaman pertama kali dimuat
window.onload = loadShopeeIndonesia;
