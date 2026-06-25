import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  BadgeDollarSign,
  Check,
  ChevronRight,
  Edit3,
  Eye,
  LogIn,
  LogOut,
  Minus,
  PackagePlus,
  Save,
  Search,
  Shield,
  ShoppingCart,
  SlidersHorizontal,
  Trash2,
  UserRound,
  X
} from 'lucide-react';
import { motion } from 'framer-motion';
import './styles.css';

const PdfDownload = lazy(() => import('./QuotePdf.jsx'));

const blankCustomer = {
  projectName: '',
  clientCompany: '',
  contactName: '',
  address: '',
  phone: '',
  mobile: '',
  email: '',
  costCenter: ''
};

async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
  }
}

function formatMoney(value, currencyCode = 'COP') {
  return new Intl.NumberFormat(currencyCode === 'USD' ? 'en-US' : 'es-CO', {
    style: 'currency',
    currency: currencyCode,
    maximumFractionDigits: currencyCode === 'USD' ? 2 : 0
  }).format(Number(value) || 0);
}

function convertPrice(product, targetCurrency, trm) {
  const price = Number(product.price) || 0;
  const source = product.currency === 'USD' ? 'USD' : 'COP';
  const target = targetCurrency === 'USD' ? 'USD' : 'COP';
  if (source === target) return price;
  return source === 'USD' ? price * trm : price / trm;
}

function App() {
  const [view, setView] = useState('quote');
  const [products, setProducts] = useState([]);
  const [settings, setSettings] = useState({ trm: 4000, defaultCurrency: 'COP' });
  const [admin, setAdmin] = useState(null);
  const [loading, setLoading] = useState(true);

  async function loadProducts(includeInactive = false) {
    try {
      const res = await fetchWithTimeout(`/api/products${includeInactive ? '?includeInactive=true' : ''}`, {
        credentials: 'include'
      });
      if (!res.ok) return setProducts([]);
      setProducts(await res.json());
    } catch {
      setProducts([]);
    }
  }

  async function loadSettings() {
    try {
      const res = await fetchWithTimeout('/api/settings', { credentials: 'include' });
      if (res.ok) setSettings(await res.json());
    } catch {
      setSettings({ trm: 4000, defaultCurrency: 'COP' });
    }
  }

  useEffect(() => {
    Promise.all([
      loadProducts(),
      loadSettings(),
      fetch('/api/auth/me', { credentials: 'include' })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => setAdmin(data?.admin || null))
    ]).finally(() => setLoading(false));
  }, []);

  return (
    <main className="app-shell">
      <nav className="topbar">
        <button className="brand" onClick={() => setView('quote')}>
          <span className="brand-mark">K</span>
          <span>
            <strong>Komodo</strong>
            <small>Cotizador online</small>
          </span>
        </button>
        <div className="nav-actions">
          <button className={view === 'quote' ? 'active' : ''} onClick={() => setView('quote')}>
            Cotizar
          </button>
          <button className={view === 'admin' ? 'active' : ''} onClick={() => setView('admin')}>
            <Shield size={16} />
            Admin
          </button>
        </div>
      </nav>

      {loading ? (
        <div className="loading">Cargando cotizador...</div>
      ) : view === 'admin' ? (
        <AdminPanel
          admin={admin}
          setAdmin={setAdmin}
          products={products}
          settings={settings}
          reloadProducts={() => loadProducts(true)}
          reloadSettings={loadSettings}
        />
      ) : (
        <QuoteBuilder products={products.filter((product) => product.active)} settings={settings} />
      )}
    </main>
  );
}

function QuoteBuilder({ products, settings }) {
  const [customer, setCustomer] = useState(blankCustomer);
  const [detailsReady, setDetailsReady] = useState(false);
  const [currencyCode, setCurrencyCode] = useState(settings.defaultCurrency || 'COP');
  const [quantities, setQuantities] = useState({});
  const [query, setQuery] = useState('');
  const [quote, setQuote] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const trm = Number(settings.trm) || 4000;

  const customerComplete =
    customer.projectName &&
    customer.clientCompany &&
    customer.contactName &&
    customer.address &&
    customer.mobile &&
    customer.email;

  const selectedItems = useMemo(
    () =>
      products
        .filter((product) => quantities[product.id] > 0)
        .map((product) => {
          const unitPrice = convertPrice(product, currencyCode, trm);
          return {
            ...product,
            quantity: quantities[product.id],
            displayPrice: unitPrice,
            lineTotal: unitPrice * quantities[product.id]
          };
        }),
    [products, quantities, currencyCode, trm]
  );

  const subtotal = selectedItems.reduce((sum, item) => sum + item.lineTotal, 0);
  const filteredProducts = products.filter((product) =>
    `${product.reference} ${product.name} ${product.description}`.toLowerCase().includes(query.toLowerCase())
  );
  const visibleProducts = filteredProducts.slice(0, 80);

  function setField(field, value) {
    setCustomer((current) => ({ ...current, [field]: value }));
  }

  function updateQty(productId, quantity) {
    const next = Math.max(0, Number.parseInt(quantity, 10) || 0);
    setQuote(null);
    setQuantities((current) => ({ ...current, [productId]: next }));
  }

  function continueToCatalog(event) {
    event.preventDefault();
    if (!customerComplete) return;
    setDetailsReady(true);
  }

  async function submitQuote(event) {
    event.preventDefault();
    setSubmitting(true);
    const res = await fetch('/api/quotes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer,
        currency: currencyCode,
        items: selectedItems.map((item) => ({ productId: item.id, quantity: item.quantity }))
      })
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) return alert(data.message || 'No se pudo crear la cotizacion');
    setQuote(data);
  }

  if (!detailsReady) {
    return (
      <section className="lead-screen">
        <div className="lead-hero">
          <p className="eyebrow">Komodo cotizador</p>
          <h1>Cotizacion precisa desde el primer dato.</h1>
          <div className="hero-metrics">
            <span>{products.length.toLocaleString('es-CO')} productos</span>
            <span>TRM {formatMoney(trm, 'COP')}</span>
            <span>USD / COP</span>
          </div>
        </div>

        <form className="lead-form" onSubmit={continueToCatalog}>
          <div className="panel-title">
            <UserRound size={22} />
            <div>
              <h2>Datos del cliente</h2>
              <p>Proyecto, contacto y facturacion comercial.</p>
            </div>
          </div>
          <div className="form-grid">
            <Input label="Proyecto" value={customer.projectName} onChange={(v) => setField('projectName', v)} required />
            <Input label="Cliente" value={customer.clientCompany} onChange={(v) => setField('clientCompany', v)} required />
            <Input label="Dirigido a" value={customer.contactName} onChange={(v) => setField('contactName', v)} required />
            <Input label="E-Mail" type="email" value={customer.email} onChange={(v) => setField('email', v)} required />
            <Input label="Direccion" value={customer.address} onChange={(v) => setField('address', v)} required />
            <Input label="Celular" value={customer.mobile} onChange={(v) => setField('mobile', v)} required />
            <Input label="Telefono" value={customer.phone} onChange={(v) => setField('phone', v)} />
            <Input label="Centro de costo" value={customer.costCenter} onChange={(v) => setField('costCenter', v)} />
          </div>
          <button className="primary-action" disabled={!customerComplete}>
            Continuar
            <ChevronRight size={18} />
          </button>
        </form>
      </section>
    );
  }

  return (
    <section className="quote-workspace">
      <header className="quote-commandbar">
        <div className="client-chip">
          <UserRound size={18} />
          <div>
            <strong>{customer.clientCompany}</strong>
            <span>{customer.projectName}</span>
          </div>
        </div>
        <div className="command-actions">
          <div className="currency-switch" role="group" aria-label="Moneda">
            <button className={currencyCode === 'COP' ? 'selected' : ''} onClick={() => setCurrencyCode('COP')}>
              COP
            </button>
            <button className={currencyCode === 'USD' ? 'selected' : ''} onClick={() => setCurrencyCode('USD')}>
              USD
            </button>
          </div>
          <span className="trm-pill">TRM {formatMoney(trm, 'COP')}</span>
          <button className="icon-text" onClick={() => setDetailsReady(false)}>
            <Edit3 size={16} />
            Datos
          </button>
        </div>
      </header>

      <div className="quote-grid">
        <section className="catalog-panel">
          <div className="catalog-head">
            <div>
              <p className="eyebrow">Catalogo</p>
              <h2>Productos</h2>
            </div>
            <span>{filteredProducts.length.toLocaleString('es-CO')} resultados</span>
          </div>
          <div className="search-box">
            <Search size={18} />
            <input placeholder="Buscar referencia, producto o descripcion" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="product-list">
            {visibleProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                quantity={quantities[product.id] || 0}
                currencyCode={currencyCode}
                trm={trm}
                onQuantity={updateQty}
              />
            ))}
          </div>
          {filteredProducts.length > visibleProducts.length && (
            <p className="list-note">Mostrando {visibleProducts.length} productos. Usa la busqueda para acotar la base.</p>
          )}
        </section>

        <aside className="cart-panel">
          <div className="panel-title">
            <ShoppingCart size={22} />
            <div>
              <h2>Cotizacion</h2>
              <p>{selectedItems.length} productos seleccionados</p>
            </div>
          </div>

          <div className="cart-list">
            {selectedItems.length === 0 ? (
              <div className="empty-cart">Selecciona cantidades en el catalogo.</div>
            ) : (
              selectedItems.map((item) => (
                <div className="cart-row" key={item.id}>
                  <div>
                    <strong>{item.reference}</strong>
                    <span>{item.name}</span>
                  </div>
                  <div className="cart-qty">
                    <button onClick={() => updateQty(item.id, item.quantity - 1)}>
                      <Minus size={14} />
                    </button>
                    <input value={item.quantity} type="number" min="1" onChange={(event) => updateQty(item.id, event.target.value)} />
                  </div>
                  <strong>{formatMoney(item.lineTotal, currencyCode)}</strong>
                </div>
              ))
            )}
          </div>

          <form className="checkout-box" onSubmit={submitQuote}>
            <div>
              <span>Subtotal</span>
              <strong>{formatMoney(subtotal, currencyCode)}</strong>
            </div>
            <button className="primary-action" disabled={!selectedItems.length || submitting}>
              {submitting ? 'Enviando...' : 'Enviar cotizacion'}
              <ChevronRight size={18} />
            </button>
          </form>

          {quote && (
            <motion.div className="success-box" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <Check size={18} />
              <span>Oferta #{quote.number} creada.</span>
              <Suspense fallback={<span className="download-link">Preparando PDF</span>}>
                <PdfDownload quote={quote} customer={customer} />
              </Suspense>
            </motion.div>
          )}
        </aside>
      </div>
    </section>
  );
}

function ProductCard({ product, quantity, currencyCode, trm, onQuantity }) {
  const displayPrice = convertPrice(product, currencyCode, trm);
  return (
    <article className={quantity > 0 ? 'product-card selected' : 'product-card'}>
      <ProductImage src={product.imageUrl} alt={product.reference} />
      <div className="product-body">
        <div className="product-meta">
          <span>{product.reference}</span>
          <span>{product.unit}</span>
        </div>
        <strong>{product.name}</strong>
        <p>{product.description}</p>
      </div>
      <div className="product-buy">
        <span>{product.currency}</span>
        <strong>{formatMoney(displayPrice, currencyCode)}</strong>
        <input
          aria-label={`Cantidad ${product.reference}`}
          min="0"
          type="number"
          value={quantity || ''}
          placeholder="0"
          onChange={(event) => onQuantity(product.id, event.target.value)}
        />
      </div>
    </article>
  );
}

function AdminPanel({ admin, setAdmin, products, settings, reloadProducts, reloadSettings }) {
  const [login, setLogin] = useState({ email: '', password: '' });
  const [product, setProduct] = useState({
    reference: '',
    name: '',
    description: '',
    price: '',
    currency: 'COP',
    imageUrl: '',
    unit: 'UND'
  });
  const [drafts, setDrafts] = useState({});
  const [quotes, setQuotes] = useState([]);
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState({ status: 'active', currency: 'all', sort: 'reference' });
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [trmDraft, setTrmDraft] = useState(settings.trm || 4000);

  useEffect(() => {
    setTrmDraft(settings.trm || 4000);
  }, [settings.trm]);

  useEffect(() => {
    if (admin) {
      reloadProducts();
      reloadSettings();
      fetch('/api/quotes', { credentials: 'include' })
        .then((res) => res.json())
        .then(setQuotes);
    }
  }, [admin]);

  useEffect(() => {
    setDrafts(
      Object.fromEntries(
        products.map((item) => [
          item.id,
          {
            name: item.name,
            price: item.price,
            currency: item.currency || 'COP',
            active: item.active
          }
        ])
      )
    );
  }, [products]);

  async function signIn(event) {
    event.preventDefault();
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(login)
    });
    const data = await res.json();
    if (!res.ok) return alert(data.message || 'No se pudo ingresar');
    setAdmin(data.admin);
  }

  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    setAdmin(null);
  }

  async function saveTrm(event) {
    event.preventDefault();
    const res = await fetch('/api/settings/trm', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trm: trmDraft })
    });
    const data = await res.json();
    if (!res.ok) return alert(data.message || 'No se pudo actualizar la TRM');
    await reloadSettings();
  }

  async function saveProduct(event) {
    event.preventDefault();
    const res = await fetch('/api/products', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(product)
    });
    const data = await res.json();
    if (!res.ok) return alert(data.message || 'No se pudo guardar');
    setProduct({ reference: '', name: '', description: '', price: '', currency: 'COP', imageUrl: '', unit: 'UND' });
    setProductModalOpen(false);
    reloadProducts();
  }

  async function setProductActive(item, active) {
    const res = await fetch(`/api/products/${item.id}`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...item,
        active
      })
    });
    const data = await res.json();
    if (!res.ok) return alert(data.message || 'No se pudo actualizar');
    reloadProducts();
  }

  async function updateProduct(item) {
    const draft = drafts[item.id] || item;
    const res = await fetch(`/api/products/${item.id}`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...item,
        name: draft.name,
        price: draft.price,
        currency: draft.currency,
        active: draft.active
      })
    });
    const data = await res.json();
    if (!res.ok) return alert(data.message || 'No se pudo actualizar');
    reloadProducts();
  }

  const filteredProducts = products
    .filter((item) => {
      const textMatches = `${item.reference} ${item.name} ${item.description}`.toLowerCase().includes(query.toLowerCase());
      const statusMatches =
        filters.status === 'all' || (filters.status === 'active' ? item.active : !item.active);
      const currencyMatches = filters.currency === 'all' || (item.currency || 'COP') === filters.currency;
      return textMatches && statusMatches && currencyMatches;
    })
    .sort((a, b) => {
      if (filters.sort === 'price_desc') return Number(b.price) - Number(a.price);
      if (filters.sort === 'price_asc') return Number(a.price) - Number(b.price);
      if (filters.sort === 'name') return a.name.localeCompare(b.name);
      return a.reference.localeCompare(b.reference);
    });

  const visibleAdminProducts = filteredProducts.slice(0, 96);

  if (!admin) {
    return (
      <section className="admin-login">
        <form onSubmit={signIn}>
          <span className="login-icon">
            <Shield size={28} />
          </span>
          <h1>Administrador</h1>
          <Input label="Correo" type="email" value={login.email} onChange={(v) => setLogin((x) => ({ ...x, email: v }))} required />
          <Input label="Contrasena" type="password" value={login.password} onChange={(v) => setLogin((x) => ({ ...x, password: v }))} required />
          <button className="primary-action">
            <LogIn size={18} />
            Ingresar
          </button>
        </form>
      </section>
    );
  }

  return (
    <section className="admin-layout">
      <header className="admin-header">
        <div>
          <p className="eyebrow">Panel seguro</p>
          <h1>Productos y cotizaciones</h1>
        </div>
        <div className="admin-actions">
          <button type="button" className="primary-action" onClick={() => setProductModalOpen(true)}>
            <PackagePlus size={18} />
            Nuevo producto
          </button>
          <button type="button" className="ghost" onClick={signOut}>
            <LogOut size={18} />
            Salir
          </button>
        </div>
      </header>

      {productModalOpen && (
        <div className="modal-backdrop" role="presentation">
          <form className="product-modal" onSubmit={saveProduct}>
            <div className="modal-head">
              <div>
                <p className="eyebrow">Catalogo</p>
                <h2>Nuevo producto</h2>
              </div>
              <button type="button" className="icon-button" onClick={() => setProductModalOpen(false)} aria-label="Cerrar">
                <X size={18} />
              </button>
            </div>
            <div className="form-grid">
              <Input label="Referencia" value={product.reference} onChange={(v) => setProduct((x) => ({ ...x, reference: v }))} required />
              <Input label="Nombre" value={product.name} onChange={(v) => setProduct((x) => ({ ...x, name: v }))} required />
              <Input label="Precio" type="number" value={product.price} onChange={(v) => setProduct((x) => ({ ...x, price: v }))} required />
              <SelectInput label="Moneda" value={product.currency} onChange={(v) => setProduct((x) => ({ ...x, currency: v }))} />
              <Input label="Unidad" value={product.unit} onChange={(v) => setProduct((x) => ({ ...x, unit: v }))} />
              <Input label="Imagen URL" value={product.imageUrl} onChange={(v) => setProduct((x) => ({ ...x, imageUrl: v }))} />
            </div>
            <label>
              <span>Descripcion</span>
              <textarea value={product.description} onChange={(e) => setProduct((x) => ({ ...x, description: e.target.value }))} required />
            </label>
            <button className="primary-action">
              <PackagePlus size={18} />
              Crear producto
            </button>
          </form>
        </div>
      )}

      <div className="admin-stats">
        <form className="stat-card trm-card" onSubmit={saveTrm}>
          <BadgeDollarSign size={24} />
          <div>
            <span>TRM</span>
            <input value={trmDraft} type="number" min="1" onChange={(event) => setTrmDraft(event.target.value)} />
          </div>
          <button title="Guardar TRM">
            <Save size={17} />
          </button>
        </form>
        <div className="stat-card">
          <SlidersHorizontal size={24} />
          <div>
            <span>Productos activos</span>
            <strong>{products.filter((item) => item.active).length.toLocaleString('es-CO')}</strong>
          </div>
        </div>
        <div className="stat-card">
          <Eye size={24} />
          <div>
            <span>Cotizaciones</span>
            <strong>{quotes.length}</strong>
          </div>
        </div>
      </div>

      <section className="admin-table">
        <div className="table-head">
          <div>
            <p className="eyebrow">Base de productos</p>
            <h2>{filteredProducts.length.toLocaleString('es-CO')} productos</h2>
          </div>
          <div className="search-box compact">
            <Search size={16} />
            <input placeholder="Buscar referencia, nombre o descripcion" value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
        </div>

        <div className="admin-filters">
          <div className="filter-group">
            {[
              ['active', 'Activos'],
              ['all', 'Todos'],
              ['inactive', 'Inactivos']
            ].map(([value, label]) => (
              <button
                type="button"
                className={filters.status === value ? 'selected' : ''}
                key={value}
                onClick={() => setFilters((current) => ({ ...current, status: value }))}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="filter-group">
            {[
              ['all', 'Todas'],
              ['COP', 'COP'],
              ['USD', 'USD']
            ].map(([value, label]) => (
              <button
                type="button"
                className={filters.currency === value ? 'selected' : ''}
                key={value}
                onClick={() => setFilters((current) => ({ ...current, currency: value }))}
              >
                {label}
              </button>
            ))}
          </div>
          <select value={filters.sort} onChange={(event) => setFilters((current) => ({ ...current, sort: event.target.value }))}>
            <option value="reference">Referencia</option>
            <option value="name">Nombre</option>
            <option value="price_asc">Precio menor</option>
            <option value="price_desc">Precio mayor</option>
          </select>
        </div>

        <div className="admin-product-grid">
          {visibleAdminProducts.map((item) => (
            <AdminProductCard
              key={item.id}
              item={item}
              draft={drafts[item.id] || item}
              setDrafts={setDrafts}
              onSave={updateProduct}
              onSetActive={setProductActive}
            />
          ))}
        </div>
        {filteredProducts.length > visibleAdminProducts.length && (
          <p className="list-note">Mostrando {visibleAdminProducts.length} de {filteredProducts.length}. Usa busqueda y filtros para acotar.</p>
        )}
      </section>

      <div className="quotes-list">
        <h2>Cotizaciones recibidas</h2>
        {quotes.map((quote) => (
          <article key={quote.id}>
            <Eye size={18} />
            <div>
              <strong>Oferta #{quote.number} - {quote.projectName}</strong>
              <span>{quote.clientCompany} - {quote.contactName} - {quote.email}</span>
            </div>
            <strong>{formatMoney(quote.total, quote.currency || 'COP')}</strong>
          </article>
        ))}
      </div>
    </section>
  );
}

function AdminProductCard({ item, draft, setDrafts, onSave, onSetActive }) {
  const active = Boolean(draft.active ?? item.active);

  function updateDraft(field, value) {
    setDrafts((current) => ({
      ...current,
      [item.id]: {
        ...current[item.id],
        [field]: value
      }
    }));
  }

  return (
    <article className={item.active ? 'admin-product-card' : 'admin-product-card inactive'}>
      <div className="admin-product-media">
        <ProductImage src={item.imageUrl} alt={item.reference} />
      </div>
      <div className="admin-product-content">
        <div className="admin-product-top">
          <span className="ref-badge">{item.reference}</span>
          <span className={active ? 'state-badge active' : 'state-badge inactive'}>
            {active ? 'Activo' : 'Inactivo'}
          </span>
        </div>

        <label>
          <span>Nombre</span>
          <input value={draft.name || ''} onChange={(event) => updateDraft('name', event.target.value)} />
        </label>

        <div className="admin-card-fields">
          <label>
            <span>Precio</span>
            <input type="number" min="0" value={draft.price || ''} onChange={(event) => updateDraft('price', event.target.value)} />
          </label>
          <label>
            <span>Moneda</span>
            <select value={draft.currency || 'COP'} onChange={(event) => updateDraft('currency', event.target.value)}>
              <option value="COP">COP</option>
              <option value="USD">USD</option>
            </select>
          </label>
          <label>
            <span>Estado</span>
            <select value={active ? 'active' : 'inactive'} onChange={(event) => updateDraft('active', event.target.value === 'active')}>
              <option value="active">Activo</option>
              <option value="inactive">Inactivo</option>
            </select>
          </label>
        </div>

        <p>{item.description}</p>

        <div className="admin-card-actions">
          <button type="button" className="primary-action" onClick={() => onSave(item)}>
            <Save size={16} />
            Guardar
          </button>
          <button type="button" className={item.active ? 'danger-action' : 'success-action'} onClick={() => onSetActive(item, !item.active)}>
            {item.active ? <Trash2 size={16} /> : <Check size={16} />}
            {item.active ? 'Desactivar' : 'Activar'}
          </button>
        </div>
      </div>
    </article>
  );
}

function ProductImage({ src, alt }) {
  const [failed, setFailed] = useState(false);
  const imageSrc = !failed && src ? src : '/placeholder-product.svg';

  useEffect(() => {
    setFailed(false);
  }, [src]);

  return <img src={imageSrc} alt={alt || ''} loading="lazy" onError={() => setFailed(true)} />;
}

function Input({ label, value, onChange, type = 'text', required = false }) {
  return (
    <label>
      <span>{label}</span>
      <input type={type} value={value} required={required} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function SelectInput({ label, value, onChange }) {
  return (
    <label>
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="COP">COP</option>
        <option value="USD">USD</option>
      </select>
    </label>
  );
}

createRoot(document.getElementById('root')).render(<App />);
