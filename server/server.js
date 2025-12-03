const express = require('express');
const path = require('path');
const dotenv = require('dotenv');
const { saveOrder, getOrders } = require('./db');

dotenv.config();

const app = express();

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

app.use(express.json());

const PORT = process.env.PORT || 3000;
const PAYPAL_API = process.env.PAYPAL_API;
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;

if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET || !PAYPAL_API) {
  console.warn('⚠️ Configuracion PayPal incompleta. Verifica el archivo .env');
}

const fetch = (...args) => import('node-fetch').then(({ default: fetchFn }) => fetchFn(...args));

async function generateAccessToken() {
  const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64');
  const response = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
    method: 'POST',
    body: new URLSearchParams({ grant_type: 'client_credentials' }),
    headers: {
      Authorization: `Basic ${auth}`
    }
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Error obteniendo token PayPal: ${response.status} ${error}`);
  }

  const data = await response.json();
  return data.access_token;
}

async function createOrder(purchaseUnits = []) {
  const accessToken = await generateAccessToken();
  const response = await fetch(`${PAYPAL_API}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: purchaseUnits
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Error creando orden PayPal: ${response.status} ${error}`);
  }

  return response.json();
}

async function captureOrder(orderId) {
  const accessToken = await generateAccessToken();
  const response = await fetch(`${PAYPAL_API}/v2/checkout/orders/${orderId}/capture`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Error capturando orden PayPal: ${response.status} ${error}`);
  }

  return response.json();
}

app.post('/api/create-order', async (req, res) => {
  try {
    const { items, purchase_units } = req.body || {};

    const defaultItems = [
      {
        name: 'Vino Tinto Reserva',
        description: 'Simulacion de compra',
        quantity: '1',
        unit_amount: { currency_code: 'MXN', value: '250.00' },
        sku: 'vino-reserva-001'
      }
    ];

    const defaultPurchaseUnits = [
      {
        reference_id: 'default-cart',
        amount: {
          currency_code: 'MXN',
          value: '250.00',
          breakdown: {
            item_total: { currency_code: 'MXN', value: '250.00' }
          }
        },
        items: defaultItems
      }
    ];

    const orderResponse = await createOrder(purchase_units && purchase_units.length ? purchase_units : defaultPurchaseUnits);

    // Adjuntar items usados para que el frontend pueda reenviarlos cuando capturemos.
    res.json({
      id: orderResponse.id,
      status: orderResponse.status,
      items: items && items.length ? items : defaultItems
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/capture-order', async (req, res) => {
  const { orderID, items } = req.body || {};
  if (!orderID) {
    return res.status(400).json({ error: 'orderID es requerido' });
  }

  try {
    const capture = await captureOrder(orderID);
    const purchaseUnit = capture.purchase_units?.[0];
    const captureStatus = capture.status;
    const captureId = purchaseUnit?.payments?.captures?.[0]?.id || orderID;
    const amount = purchaseUnit?.payments?.captures?.[0]?.amount || purchaseUnit?.amount;
    const payer = capture.payer || {};

    const itemList = purchaseUnit?.items || items || [];
    const normalizedItems = itemList.map((item) => ({
      product_id: item.sku || item.id || 'sku-desconocido',
      name: item.name,
      price: parseFloat(item.unit_amount?.value || item.price || amount?.value || '0'),
      qty: parseInt(item.quantity || item.qty || 1, 10)
    }));

    const orderRecord = {
      paypal_order_id: capture.id,
      status: captureStatus,
      payer_email: payer.email_address || null,
      payer_name: payer.name ? `${payer.name.given_name || ''} ${payer.name.surname || ''}`.trim() : null,
      amount_value: amount?.value || null,
      amount_currency: amount?.currency_code || 'MXN',
      items: normalizedItems
    };

    const savedOrderId = saveOrder(orderRecord);

    res.json({
      id: savedOrderId,
      paypalOrderId: capture.id,
      status: captureStatus,
      message: `Orden ${capture.id} capturada y registrada.`
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/orders', (req, res) => {
  try {
    const orders = getOrders();
    res.json({ orders });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

const siteDir = path.join(__dirname, '..', 'site-formspree');
const publicDir = path.join(__dirname, '..', 'public');

app.use(express.static(siteDir));
app.use('/public', express.static(publicDir));

app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});
