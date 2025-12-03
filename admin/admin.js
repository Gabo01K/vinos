
/* Admin data stored in localStorage (demo). Keys prefixed with lr_ */
const MXN = new Intl.NumberFormat('es-MX',{style:'currency', currency:'MXN'});
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

const DB = {
  get(key, def){ try{ return JSON.parse(localStorage.getItem('lr_'+key) || JSON.stringify(def)) }catch(e){ return def } },
  set(key, val){ localStorage.setItem('lr_'+key, JSON.stringify(val)); },
  push(key, item){ const a = DB.get(key, []); a.push(item); DB.set(key, a); return a; }
};

// Bootstrap products with the 3 vinos if empty
(function seed(){
  if(DB.get('products', []).length===0){
    DB.set('products', [
      {sku:'LR-TIN-001', name:'Vino Tinto Reserva', category:'Tinto', cost:200, price:350, stock:0, min:6, provider:'', lotTracked:false},
      {sku:'LR-BLA-002', name:'Vino Blanco Joven', category:'Blanco', cost:170, price:290, stock:0, min:6, provider:'', lotTracked:false},
      {sku:'LR-ROS-003', name:'Vino Rosado Seco', category:'Rosado', cost:180, price:310, stock:0, min:6, provider:'', lotTracked:false},
    ]);
  }
  if(!localStorage.getItem('lr_moves')) DB.set('moves', []);
  if(!localStorage.getItem('lr_sales')) DB.set('sales', []);
  if(!localStorage.getItem('lr_lots')) DB.set('lots', []);
  if(!localStorage.getItem('lr_providers')) DB.set('providers', []);
})();

function exportCSV(filename, rows){
  if(!rows || rows.length===0){ alert('No hay datos para exportar.'); return; }
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(','), ...rows.map(r => headers.map(h => JSON.stringify(r[h] ?? '')).join(','))].join('\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
}

function printSection(id){ window.print(); }

// Inventory rendering
function renderInventory(){
  const tbody = $('#inv-rows'); if(!tbody) return;
  const products = DB.get('products', []);
  tbody.innerHTML = products.map(p=>`
    <tr>
      <td>${p.sku}</td>
      <td>${p.name}</td>
      <td>${p.category}</td>
      <td>${MXN.format(p.cost)}</td>
      <td>${MXN.format(p.price)}</td>
      <td>${p.stock}</td>
      <td>${p.min}</td>
      <td>${p.provider||''}</td>
      <td>${p.stock <= p.min ? '<span class="badge">Bajo stock</span>' : ''}</td>
    </tr>
  `).join('');
  // valor de inventario
  const val = products.reduce((n,p)=> n + (p.cost * p.stock), 0);
  $('#inv-value').textContent = MXN.format(val);
}

function addProduct(evt){
  evt.preventDefault();
  const f = evt.target;
  const prod = {
    sku: f.sku.value.trim(),
    name: f.name.value.trim(),
    category: f.category.value.trim(),
    cost: Number(f.cost.value||0),
    price: Number(f.price.value||0),
    stock: Number(f.stock.value||0),
    min: Number(f.min.value||0),
    provider: f.provider.value.trim(),
    lotTracked: f.lotTracked.checked
  };
  const products = DB.get('products', []);
  if(products.some(p=>p.sku===prod.sku)){ alert('Ese SKU ya existe.'); return; }
  products.push(prod); DB.set('products', products);
  f.reset(); renderInventory();
}

function addMovement(evt){
  evt.preventDefault();
  const f = evt.target;
  const type = f.type.value;
  const sku = f.sku.value;
  const qty = Number(f.qty.value||0);
  const note = f.note.value;
  const date = f.date.value || new Date().toISOString().slice(0,10);
  const products = DB.get('products', []);
  const p = products.find(x=>x.sku===sku);
  if(!p){ alert('Producto no encontrado'); return; }
  if(type==='entrada') p.stock += qty;
  else if(type==='salida') p.stock = Math.max(0, p.stock - qty);
  else if(type==='ajuste') p.stock = qty;
  DB.set('products', products);
  DB.push('moves', {id:uid(), type, sku, qty, date, note});
  f.reset(); renderInventory(); renderKardex();
}

function renderKardex(){
  const tbody = $('#kardex-rows'); if(!tbody) return;
  const moves = DB.get('moves', []);
  tbody.innerHTML = moves.map(m=>`
    <tr><td>${m.date}</td><td>${m.type}</td><td>${m.sku}</td><td>${m.qty}</td><td>${m.note||''}</td></tr>
  `).join('');
}

// Lotes
function renderLots(){
  const tbody = $('#lot-rows'); if(!tbody) return;
  const lots = DB.get('lots', []);
  tbody.innerHTML = lots.map(l=>`
    <tr>
      <td>${l.lot}</td><td>${l.sku}</td><td>${l.qty}</td>
      <td>${l.prodDate||''}</td><td>${l.expDate||''}</td><td>${l.notes||''}</td>
    </tr>
  `).join('');
}

function addLot(evt){
  evt.preventDefault();
  const f = evt.target;
  const lot = {
    lot: f.lot.value.trim() || ('L-'+Date.now()),
    sku: f.sku.value,
    qty: Number(f.qty.value||0),
    prodDate: f.prodDate.value,
    expDate: f.expDate.value,
    notes: f.notes.value
  };
  DB.push('lots', lot);
  // opcional: aumentar inventario
  if(f.addToInventory.checked){
    const products = DB.get('products', []);
    const p = products.find(x=>x.sku===lot.sku); if(p){ p.stock += lot.qty; DB.set('products', products); }
  }
  f.reset(); renderLots(); renderInventory();
}

// Ventas
function renderSaleItems(){
  const cont = $('#sale-items'); if(!cont) return;
  if(!cont.children.length) addSaleItemRow();
}
function addSaleItemRow(){
  const wrap = document.createElement('div');
  wrap.className = 'grid';
  wrap.style.gridTemplateColumns = '1.4fr 0.6fr 0.6fr auto';
  wrap.style.gap = '10px';
  const products = DB.get('products', []);
  wrap.innerHTML = `
    <select class="prod">${products.map(p=>`<option value="${p.sku}">${p.sku} — ${p.name}</option>`).join('')}</select>
    <input class="qty" type="number" min="1" value="1">
    <input class="price" type="number" step="0.01" placeholder="Precio (IVA inc.)">
    <button class="btn secondary rem" type="button">Quitar</button>
  `;
  wrap.querySelector('.rem').addEventListener('click', ()=> wrap.remove());
  $('#sale-items').appendChild(wrap);
}
function submitSale(evt){
  evt.preventDefault();
  const f = evt.target;
  const rows = $$('#sale-items .grid');
  if(!rows.length){ alert('Agrega al menos un producto.'); return; }
  const items = rows.map(r=>{
    const sku = r.querySelector('.prod').value;
    const qty = Number(r.querySelector('.qty').value||0);
    let price = r.querySelector('.price').value;
    if(!price){
      const p = DB.get('products', []).find(x=>x.sku===sku);
      price = p ? p.price : 0;
    }
    price = Number(price);
    return {sku, qty, price};
  });
  const subtotal = items.reduce((n,i)=> n + (i.price*i.qty)/(1+0.16), 0);
  const iva = items.reduce((n,i)=> n + (i.price*i.qty) - (i.price*i.qty)/(1+0.16), 0);
  const total = items.reduce((n,i)=> n + (i.price*i.qty), 0);
  const sale = {
    id: 'V-' + Date.now(),
    date: f.date.value || new Date().toISOString().slice(0,10),
    channel: f.channel.value,
    cliente: f.cliente.value,
    cfdi: f.cfdi.checked,
    items, subtotal, iva, total
  };
  DB.push('sales', sale);
  if(f.updateInventory.checked){
    const products = DB.get('products', []);
    items.forEach(it=>{
      const p = products.find(x=>x.sku===it.sku); if(p){ p.stock = Math.max(0, p.stock - it.qty); }
      DB.push('moves', {id:uid(), type:'venta', sku:it.sku, qty:it.qty, date:sale.date, note:sale.id});
    });
    DB.set('products', products);
  }
  f.reset(); $('#sale-items').innerHTML=''; renderSales(); renderInventory(); renderKardex();
}

function renderSales(){
  const tbody = $('#sales-rows'); if(!tbody) return;
  const sales = DB.get('sales', []);
  tbody.innerHTML = sales.map(s=>`
    <tr>
      <td>${s.id}</td><td>${s.date}</td><td>${s.channel}</td>
      <td>${s.items.map(i=>i.sku+'x'+i.qty).join(' / ')}</td>
      <td>${MXN.format(s.total)}</td>
    </tr>`).join('');
}

// Reportes
function renderReports(){
  const sales = DB.get('sales', []);
  const byChannel = sales.reduce((acc,s)=>{ acc[s.channel]=(acc[s.channel]||0)+s.total; return acc; },{});
  const list = $('#rep-channel'); if(list) list.innerHTML = Object.entries(byChannel).map(([c,v])=>`<li>${c}: <strong>${MXN.format(v)}</strong></li>`).join('');
  // Top productos
  const top = {};
  sales.forEach(s=> s.items.forEach(i=> top[i.sku]=(top[i.sku]||0)+i.qty ));
  const topList = Object.entries(top).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const l = $('#rep-top'); if(l) l.innerHTML = topList.map(([sku,q])=>`<li>${sku}: <strong>${q}</strong> uds</li>`).join('');
  // Valor inventario
  const products = DB.get('products', []);
  const val = products.reduce((n,p)=> n + (p.cost * p.stock), 0);
  const vv = $('#rep-inv'); if(vv) vv.textContent = MXN.format(val);
}

document.addEventListener('DOMContentLoaded', ()=>{
  renderInventory(); renderKardex(); renderLots(); renderSales(); renderReports(); renderSaleItems();
  // wire actions
  const addBtn = $('#add-row'); if(addBtn) addBtn.addEventListener('click', addSaleItemRow);
});
