const BASE_URL = "https://shopee-otp-proxy.masreno6pro.workers.dev/";

// Asumsi dari Docs (Anda bisa menambahkan fungsi pencarian otomatis jika ID ini berubah)
const COUNTRY_ID_INDO = 6;
// Anda perlu mencari Platform ID untuk Shopee. Misalnya kita asumsikan ID-nya 10.
// (Anda bisa mencari ID aslinya dengan mengecek endpoint /catalog/services?country_id=6)
const PLATFORM_ID_SHOPEE = 10; 

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

// Fungsi pembantu untuk memanggil API
async function apiCall(endpoint, method = "GET", body = null) {
    const options = {
        method: method,
        headers: {
            "Authorization": `Bearer ${API_TOKEN}`,
            "Content-Type": "application/json"
        }
    };
    if (body) options.body = JSON.stringify(body);
    
    const response = await fetch(`${BASE_URL}${endpoint}`, options);
    return await response.json();
}

// 1. Muat Daftar Produk Shopee Indonesia saat halaman dibuka
async function loadProducts() {
    try {
        const res = await apiCall(`/catalog/products?country_id=${COUNTRY_ID_INDO}&platform_id=${PLATFORM_ID_SHOPEE}`);
        
        if (res.success && res.data.length > 0) {
            productSelect.innerHTML = ""; // Bersihkan opsi "Memuat..."
            
            res.data.forEach(product => {
                const option = document.createElement("option");
                option.value = product.id;
                option.text = `${product.name} - Harga: Rp ${product.price} (Stok: ${product.available})`;
                productSelect.appendChild(option);
            });
            
            productSelect.disabled = false;
            btnOrder.disabled = false;
        } else {
            productSelect.innerHTML = '<option value="">Produk tidak tersedia</option>';
        }
    } catch (error) {
    productSelect.innerHTML = '<option value="">Error: ' + error.message + '</option>';
}

}

// 2. Fungsi untuk Memesan Nomor
async function orderNumber() {
    const productId = productSelect.value;
    if (!productId) return alert("Pilih produk terlebih dahulu!");

    btnOrder.disabled = true;
    displayStatus.innerText = "Memesan...";

    try {
        const res = await apiCall('/orders/create', 'POST', { product_id: parseInt(productId), quantity: 1 });
        
        if (res.success) {
            const order = res.data.orders[0];
            currentOrderId = order.id;
            
            statusArea.classList.remove('hidden');
            displayNumber.innerText = order.phone_number;
            displayStatus.innerText = "Menunggu SMS...";
            btnCancel.classList.remove('hidden');
            
            // Mulai mengecek OTP setiap 5 detik
            startPolling(); 
        } else {
            alert("Gagal memesan: " + res.error.message);
            btnOrder.disabled = false;
        }
    } catch (error) {
        alert("Terjadi kesalahan saat memesan.");
        btnOrder.disabled = false;
    }
}

// 3. Fungsi Polling (Mengecek OTP berulang kali)
function startPolling() {
    if (pollingInterval) clearInterval(pollingInterval);
    
    pollingInterval = setInterval(async () => {
        if (!currentOrderId) return;

        const res = await apiCall(`/orders/${currentOrderId}`);
        if (res.success) {
            const orderStatus = res.data.status;
            displayStatus.innerText = `Status: ${orderStatus}`;

            if (orderStatus === "OTP_RECEIVED") {
                displayOtp.innerText = res.data.otp_code;
                clearInterval(pollingInterval);
                btnCancel.classList.add('hidden');
                btnFinish.classList.remove('hidden');
            } else if (orderStatus === "CANCELED" || orderStatus === "EXPIRED") {
                clearInterval(pollingInterval);
                displayStatus.innerText = `Pesanan ${orderStatus}`;
                btnCancel.classList.add('hidden');
                btnOrder.disabled = false;
            }
        }
    }, 5000); // Cek setiap 5 detik
}

// 4. Fungsi Batalkan Pesanan
async function cancelOrder() {
    if (!currentOrderId) return;
    
    const res = await apiCall('/orders/cancel', 'POST', { id: currentOrderId });
    if (res.success) {
        clearInterval(pollingInterval);
        displayStatus.innerText = "Dibatalkan. Saldo dikembalikan.";
        btnCancel.classList.add('hidden');
        btnOrder.disabled = false;
        currentOrderId = null;
    } else {
         alert("Gagal membatalkan: " + res.error.message);
    }
}

// 5. Fungsi Selesaikan Pesanan
async function finishOrder() {
     if (!currentOrderId) return;
     
     const res = await apiCall('/orders/finish', 'POST', { id: currentOrderId });
     if (res.success) {
         displayStatus.innerText = "Selesai.";
         btnFinish.classList.add('hidden');
         btnOrder.disabled = false;
         currentOrderId = null;
     }
}

// Event Listeners
btnOrder.addEventListener('click', orderNumber);
btnCancel.addEventListener('click', cancelOrder);
btnFinish.addEventListener('click', finishOrder);

// Jalankan saat halaman siap
window.onload = loadProducts;
