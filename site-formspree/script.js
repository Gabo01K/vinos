// Utilidades basicas
const MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));
const API_ENDPOINTS = (() => {
  const list = [];
  const { protocol, hostname, port } = window.location;
  const ensure = (url) => {
    if (url === undefined || url === null) return;
    if (!list.includes(url)) list.push(url);
  };

  if (protocol === 'file:') {
    ensure('http://localhost:3000');
    ensure('http://127.0.0.1:3000');
    return list;
  }

  if (port === '3000' || port === '' || port === null) {
    ensure('');
  } else {
    ensure(`${protocol}//${hostname}:3000`);
    if (hostname !== 'localhost') ensure(`${protocol}//localhost:3000`);
    if (hostname !== '127.0.0.1') ensure(`${protocol}//127.0.0.1:3000`);
  }
  return list;
})();

function apiFetch(path, options = {}, attempt = 0) {
  const base = API_ENDPOINTS[attempt];
  if (base === undefined) {
    return Promise.reject(new Error('Servidor de pagos no disponible. Asegúrate de que está en ejecución.'));
  }
  const url = `${base || ''}${path}`;
  return fetch(url, options)
    .then((res) => {
      if (!res.ok && attempt + 1 < API_ENDPOINTS.length) {
        return apiFetch(path, options, attempt + 1);
      }
      return res;
    })
    .catch((error) => {
      if (attempt + 1 < API_ENDPOINTS.length) {
        return apiFetch(path, options, attempt + 1);
      }
      throw error;
    });
}

function parseJsonResponse(response, fallbackMessage) {
  if (response.ok) return response.json();
  return response.json().catch(() => ({})).then((data) => {
    const message = data.error || fallbackMessage || `Error HTTP ${response.status}`;
    throw new Error(message);
  });
}

function showPayPalError(message, error) {
  console.error(message, error);
  const details = error && error.message ? `\n${error.message}` : '';
  alert(`${message}${details}`);
}

function showServerOfflineMessage() {
  showPayPalError('No pudimos contactar el servidor de pagos. Por favor asegúrate de que está iniciado (start-server.bat).', new Error('Servidor offline'));
}

const store = {
  get() {
    try {
      return JSON.parse(localStorage.getItem('cart') || '[]');
    } catch (error) {
      console.warn('No se pudo leer el carrito', error);
      return [];
    }
  },
  set(value) {
    localStorage.setItem('cart', JSON.stringify(value));
  }
};

const PRODUCTS = [
  { id: 'vino-tinto', name: 'Vino Tinto Reserva', price: 350, iva: 0.16, sku: 'LR-TIN-001', img: 'assets/images/vino1.jpg' },
  { id: 'vino-blanco', name: 'Vino Blanco Joven', price: 290, iva: 0.16, sku: 'LR-BLA-002', img: 'assets/images/vino2.jpg' },
  { id: 'vino-rosado', name: 'Vino Rosado Seco', price: 310, iva: 0.16, sku: 'LR-ROS-003', img: 'assets/images/vino3.jpg' }
];

function renderProducts() {
  const list = $('#product-list');
  if (!list) return;
  list.innerHTML = PRODUCTS.map((p) => `
    <article class="card">
      <div class="thumb"><img alt="${p.name}" src="${p.img}" onerror="this.src='https://placehold.co/400x240?text=${encodeURIComponent(p.name)}'"/></div>
      <div class="body">
        <div class="badge">IVA incluido</div>
        <h3>${p.name}</h3>
        <p class="small">SKU ${p.sku} - 750 ml</p>
        <p class="price">${MXN.format(p.price)}</p>
        <button class="btn" data-add="${p.id}">Agregar al carrito</button>
      </div>
    </article>
  `).join('');
}

function addToCart(id) {
  const cart = store.get();
  const item = cart.find((entry) => entry.id === id);
  if (item) {
    item.qty += 1;
  } else {
    cart.push({ id, qty: 1 });
  }
  store.set(cart);
  updateCartBadge();
  openCart();
  renderCart();
}

function updateCartBadge() {
  const cart = store.get();
  const count = cart.reduce((total, entry) => total + entry.qty, 0);
  const badge = $('#cart-badge');
  if (badge) badge.textContent = count;
}

function openCart() {
  const panel = $('.cart-panel');
  if (panel) panel.classList.add('open');
}

function closeCart() {
  const panel = $('.cart-panel');
  if (panel) panel.classList.remove('open');
}

function renderCart() {
  const container = $('#cart-items');
  if (!container) return;
  const cart = store.get();
  if (cart.length === 0) {
    container.innerHTML = '<p>Tu carrito esta vacio.</p>';
    const subtotalEl = $('#subtotal');
    const ivaEl = $('#iva');
    const totalEl = $('#total');
    if (subtotalEl) subtotalEl.textContent = MXN.format(0);
    if (ivaEl) ivaEl.textContent = MXN.format(0);
    if (totalEl) totalEl.textContent = MXN.format(0);
    updatePayPalButton(cart);
    return;
  }

  const rows = cart.map((entry) => {
    const product = PRODUCTS.find((p) => p.id === entry.id);
    if (!product) return '';
    const lineTotal = product.price * entry.qty;
    return `
      <div class="cart-row">
        <img src="${product.img}" alt="${product.name}" style="width:64px;height:64px;object-fit:cover;border-radius:8px" onerror="this.src='https://placehold.co/64?text=Vino'">
        <div>
          <div style="font-weight:700">${product.name}</div>
          <div class="small">SKU ${product.sku}</div>
          <div class="qty">
            <button data-dec="${product.id}">-</button>
            <span>${entry.qty}</span>
            <button data-inc="${product.id}">+</button>
            <button data-rem="${product.id}" title="Quitar" style="margin-left:auto">x</button>
          </div>
        </div>
        <div style="font-weight:800">${MXN.format(lineTotal)}</div>
      </div>
    `;
  }).join('');

  container.innerHTML = rows;

  let subtotal = 0;
  let iva = 0;
  let total = 0;

  cart.forEach((entry) => {
    const product = PRODUCTS.find((p) => p.id === entry.id);
    if (!product) return;
    const lineTotal = product.price * entry.qty;
    const base = lineTotal / (1 + product.iva);
    subtotal += base;
    iva += lineTotal - base;
    total += lineTotal;
  });

  const subtotalEl = $('#subtotal');
  const ivaEl = $('#iva');
  const totalEl = $('#total');
  if (subtotalEl) subtotalEl.textContent = MXN.format(subtotal);
  if (ivaEl) ivaEl.textContent = MXN.format(iva);
  if (totalEl) totalEl.textContent = MXN.format(total);
  updatePayPalButton(cart);
}

function bindGlobal() {
  document.addEventListener('click', (event) => {
    const add = event.target.closest('[data-add]');
    if (add) {
      addToCart(add.getAttribute('data-add'));
    }

    const inc = event.target.closest('[data-inc]');
    if (inc) {
      const id = inc.getAttribute('data-inc');
      const cart = store.get();
      const entry = cart.find((item) => item.id === id);
      if (entry) entry.qty += 1;
      store.set(cart);
      renderCart();
      updateCartBadge();
    }

    const dec = event.target.closest('[data-dec]');
    if (dec) {
      const id = dec.getAttribute('data-dec');
      const cart = store.get();
      const entry = cart.find((item) => item.id === id);
      if (!entry) return;
      entry.qty -= 1;
      if (entry.qty <= 0) cart.splice(cart.indexOf(entry), 1);
      store.set(cart);
      renderCart();
      updateCartBadge();
    }

    const rem = event.target.closest('[data-rem]');
    if (rem) {
      const id = rem.getAttribute('data-rem');
      const filtered = store.get().filter((item) => item.id !== id);
      store.set(filtered);
      renderCart();
      updateCartBadge();
    }

    if (event.target.matches('[data-open-cart]')) openCart();
    if (event.target.matches('[data-close-cart]')) closeCart();
  });

  if (!localStorage.getItem('cookie-ok')) {
    const banner = $('.cookie');
    if (banner) banner.classList.add('show');
    $$('.cookie .btn').forEach((button) =>
      button.addEventListener('click', () => {
        localStorage.setItem('cookie-ok', '1');
        const cookieBanner = $('.cookie');
        if (cookieBanner) cookieBanner.classList.remove('show');
      })
    );
  }
}

function hydrateCheckout() {
  const tbody = $('#checkout-rows');
  if (!tbody) return;
  const cart = store.get();
  tbody.innerHTML = cart.map((entry) => {
    const product = PRODUCTS.find((p) => p.id === entry.id);
    if (!product) return '';
    const line = product.price * entry.qty;
    return `<tr><td>${product.name}</td><td>${entry.qty}</td><td>${MXN.format(product.price)}</td><td>${MXN.format(line)}</td></tr>`;
  }).join('');

  let subtotal = 0;
  let iva = 0;
  let total = 0;
  cart.forEach((entry) => {
    const product = PRODUCTS.find((p) => p.id === entry.id);
    if (!product) return;
    const lineTotal = product.price * entry.qty;
    const base = lineTotal / (1 + product.iva);
    subtotal += base;
    iva += lineTotal - base;
    total += lineTotal;
  });

  const subtotalEl = $('#co-subtotal');
  const ivaEl = $('#co-iva');
  const totalEl = $('#co-total');
  if (subtotalEl) subtotalEl.textContent = MXN.format(subtotal);
  if (ivaEl) ivaEl.textContent = MXN.format(iva);
  if (totalEl) totalEl.textContent = MXN.format(total);
  sessionStorage.setItem('amount', total.toFixed(2));
}

function mapCartToPayPalPayload() {
  const cart = store.get();
  if (cart.length === 0) return null;
  const items = cart.map((entry) => {
    const product = PRODUCTS.find((p) => p.id === entry.id);
    if (!product) return null;
    return {
      sku: product.sku,
      name: product.name,
      description: `SKU ${product.sku}`,
      quantity: String(entry.qty),
      unit_amount: {
        currency_code: 'MXN',
        value: product.price.toFixed(2)
      }
    };
  }).filter(Boolean);

  if (items.length === 0) return null;

  const total = items.reduce((sum, item) => sum + parseFloat(item.unit_amount.value) * parseInt(item.quantity, 10), 0);
  const grandTotal = total.toFixed(2);

  return {
    items,
    purchase_units: [
      {
        reference_id: `cart-${Date.now()}`,
        amount: {
          currency_code: 'MXN',
          value: grandTotal,
          breakdown: {
            item_total: {
              currency_code: 'MXN',
              value: grandTotal
            }
          }
        },
        items
      }
    ]
  };
}

let paypalScriptPromise = null;
function loadPayPalScript() {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Entorno no soportado'));
  }
  if (window.paypal) return Promise.resolve();
  if (paypalScriptPromise) return paypalScriptPromise;

  paypalScriptPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById('paypal-sdk');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', reject);
      return;
    }
    const script = document.createElement('script');
    script.id = 'paypal-sdk';
    script.src = 'https://www.paypal.com/sdk/js?client-id=ATZPpu2gCIIE229RjnGs7BdMVngSVeaR21eRhCALqmw_yonSCRgjwAn3gOT9sGUbjyvshVE2M-kc3lBq&currency=MXN';
    script.onload = () => resolve();
    script.onerror = reject;
    document.head.appendChild(script);
  });

  return paypalScriptPromise;
}

function renderPayPalButtons() {
  const container = $('#paypal-button-container');
  if (!container) return;
  const cart = store.get();
  if (cart.length === 0) {
    container.dataset.ready = 'false';
    container.innerHTML = '<p class="small">Agrega productos para habilitar PayPal.</p>';
    return;
  }
  loadPayPalScript()
    .then(() => {
      if (typeof paypal === 'undefined') throw new Error('SDK de PayPal no disponible');
      container.innerHTML = '';
      paypal.Buttons({
        style: { color: 'gold', shape: 'pill', label: 'pay' },
        createOrder: () => {
          const payload = mapCartToPayPalPayload();
          if (!payload) {
            alert('Tu carrito esta vacio. Agrega vinos para continuar.');
            return Promise.reject(new Error('Carrito vacio'));
          }
          const options = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          };
          return apiFetch('/api/create-order', options)
            .then((res) => parseJsonResponse(res, 'No se pudo crear la orden.'))
            .then((data) => data.id)
            .catch((err) => {
              const message = err && err.message ? err.message.toLowerCase() : '';
              if (message.includes('failed to fetch') || message.includes('network') || message.includes('offline')) {
                showServerOfflineMessage();
              } else {
                showPayPalError('No fue posible iniciar el pago.', err);
              }
              throw err;
            });
        },
        onApprove: (data) => {
          const payload = mapCartToPayPalPayload();
          const options = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderID: data.orderID, items: payload ? payload.items : [] })
          };
          return apiFetch('/api/capture-order', options)
            .then((res) => parseJsonResponse(res, 'No se pudo capturar la orden.'))
            .then((info) => {
              store.set([]);
              renderCart();
              updateCartBadge();
              alert(`Pago simulado y venta registrada. Ticket #${info.id}`);
            })
            .catch((err) => {
              const message = err && err.message ? err.message.toLowerCase() : '';
              if (message.includes('failed to fetch') || message.includes('network') || message.includes('offline')) {
                showServerOfflineMessage();
              } else {
                showPayPalError('No se pudo completar el pago.', err);
              }
            });
        },
        onCancel: (data) => {
          console.warn('Pago cancelado', data);
          alert('Pago cancelado por el usuario.');
        },
        onError: (err) => {
          showPayPalError('Ocurrio un error con PayPal. Intenta de nuevo.', err);
        }
      }).render('#paypal-button-container');
      container.dataset.ready = 'true';
    })
    .catch((err) => {
      console.error('No fue posible cargar PayPal', err);
      container.innerHTML = `<p class="small">Error cargando PayPal: ${err.message}</p>`;
      container.dataset.ready = 'false';
    });
}

function updatePayPalButton(cartState) {
  const container = $('#paypal-button-container');
  if (!container) return;
  if (cartState.length === 0) {
    container.dataset.ready = 'false';
    container.innerHTML = '<p class="small">Agrega productos para habilitar PayPal.</p>';
    return;
  }
  container.dataset.ready = 'false';
  container.innerHTML = '<p class="small">Preparando PayPal...</p>';
  renderPayPalButtons();
}

document.addEventListener('DOMContentLoaded', () => {
  renderProducts();
  renderCart();
  updateCartBadge();
  bindGlobal();
  hydrateCheckout();
  renderPayPalButtons();
});
