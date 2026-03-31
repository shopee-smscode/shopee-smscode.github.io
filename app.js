// 1. GANTI URL INI DENGAN URL CLOUDFLARE WORKER ANDA
// Contoh: "https://shopee-otp-proxy.username-anda.workers.dev"
const BASE_URL = "https://shopee-otp-proxy.masreno6pro.workers.dev"; 

const COUNTRY_ID_INDO = 6;
const PLATFORM_ID_SHOPEE = 10; // Pastikan ID platform Shopee benar (bisa dicek di dokumentasi)

let currentOrderId = null;
let pollingInterval = null;

// Elemen DOM
const productSelect = document.getElementById('productSelect');
const btnOrder = document.getElementById('btnOrder');
const statusArea = document.getElementById('statusArea');
const displayNumber = document.getElementById('displayNumber');
const displayStatus = document.getElementById('displayStatus');
const displayOtp = document.getElementById('displayOtp');
const btnCancel = document.getElementById('btnCancel');
const btnFinish = document.getElementById('btnFinish');

// Fungsi pembantu untuk memanggil API via Cloudflare
async function apiCall(endpoint, method = "GET", body = null) {
    const options = {
        method: method,
        headers: {
            // Token dihapus dari sini, Cloudflare yang akan menyisipkannya
            "Content-Type": "application/json"
        }
    };
    if (body) options.body = JSON.stringify(body);
    
    const response = await fetch(`${BASE_URL}${endpoint}`, options);
    return await response.json();
}

// Muat Daftar Produk Shopee Indonesia
async function loadProducts() {
    try {
        const res = await apiCall(`/catalog/products?country_id=${COUNTRY_ID_INDO}&platform_id=${PLATFORM_ID_SHOPEE}`);
        
        if (res.success && res.data.length > 0) {
            productSelect.innerHTML = ""; 
            res.data.forEach(product => {
                const option = document.createElement("option");
                option.value = product.id;
                option.text = `${product.name} - Rp ${product.price} (${product.available})`;
                productSelect.appendChild(option);
            });
            productSelect.disabled = false;
            btnOrder.disabled = false;
        } else {
            productSelect.innerHTML = '<option value="">Produk kosong</option>';
        }
    } catch (error) {
        productSelect.innerHTML = '<option value="">Koneksi error</option>';
    }
}

// Fungsi Memesan Nomor
async function orderNumber() {
    const productId = productSelect.value;
    if (!productId) {
        displayStatus.innerText = "Pilih produk!";
        return;
    }

    btnOrder.disabled = true;
    statusArea.classList.remove('hidden');
    displayStatus.innerText = "Memesan...";
    displayNumber.innerText = "-";
    displayOtp.innerText = "-";

    try {
        const res = await apiCall('/orders/create', 'POST', { product_id: parseInt(productId), quantity: 1 });
        
        if (res.success) {
            const order = res.data.orders[0];
            currentOrderId = order.id;
            
            displayNumber.innerText = order.phone_number;
            displayStatus.innerText = "Tunggu SMS...";
            btnCancel.classList.remove('hidden');
            btnFinish.classList.add('hidden');
            
            startPolling(); 
        } else {
            displayStatus.innerText = "Gagal pesan";
            btnOrder.disabled = false;
        }
    } catch (error) {
        displayStatus.innerText = "Error jaringan";
        btnOrder.disabled = false;
    }
}

// Fungsi Mengecek OTP
function startPolling() {
    if (pollingInterval) clearInterval(pollingInterval);
    
    pollingInterval = setInterval(async () => {
        if (!currentOrderId) return;

        try {
            const res = await apiCall(`/orders/${currentOrderId}`);
            if (res.success) {
                const orderStatus = res.data.status;
                
                if (orderStatus === "OTP_RECEIVED") {
                    displayStatus.innerText = "OTP Masuk!";
                    displayOtp.innerText = res.data.otp_code;
                    clearInterval(pollingInterval);
                    btnCancel.classList.add('hidden');
                    btnFinish.classList.remove('hidden');
                } else if (orderStatus === "CANCELED" || orderStatus === "EXPIRED") {
                    displayStatus.innerText = "Pesanan batal/kadaluarsa";
                    clearInterval(pollingInterval);
                    btnCancel.classList.add('hidden');
                    btnOrder.disabled = false;
                }
            }
        } catch (error) {
            displayStatus.innerText = "Gagal cek status";
        }
    }, 5000); // Cek setiap 5 detik
}

// Fungsi Batalkan Pesanan
async function cancelOrder() {
    if (!currentOrderId) return;
    
    displayStatus.innerText = "Membatalkan...";
    try {
        const res = await apiCall('/orders/cancel', 'POST', { id: currentOrderId });
        if (res.success) {
            clearInterval(pollingInterval);
            displayStatus.innerText = "Dibatalkan (Saldo kembali)";
            btnCancel.classList.add('hidden');
            btnOrder.disabled = false;
            currentOrderId = null;
        } else {
             displayStatus.innerText = "Gagal batal";
        }
    } catch (error) {
        displayStatus.innerText = "Error batal";
    }
}

// Fungsi Selesaikan Pesanan
async function finishOrder() {
     if (!currentOrderId) return;
     
     displayStatus.innerText = "Menyelesaikan...";
     try {
         const res = await apiCall('/orders/finish', 'POST', { id: currentOrderId });
         if (res.success) {
             displayStatus.innerText = "Selesai";
             btnFinish.classList.add('hidden');
             btnOrder.disabled = false;
             currentOrderId = null;
         } else {
             displayStatus.innerText = "Gagal selesai";
         }
     } catch (error) {
         displayStatus.innerText = "Error selesai";
     }
}

// Event Listeners
btnOrder.addEventListener('click', orderNumber);
btnCancel.addEventListener('click', cancelOrder);
btnFinish.addEventListener('click', finishOrder);

// Jalankan saat halaman siap
window.onload = loadProducts;
