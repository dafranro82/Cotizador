import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowRight,
  Check,
  Download,
  Eye,
  LogIn,
  LogOut,
  PackagePlus,
  Save,
  Search,
  Shield,
  Trash2
} from 'lucide-react';
import { motion } from 'framer-motion';
import './styles.css';

const PdfDownload = lazy(() => import('./QuotePdf.jsx'));

const currency = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0
});

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

async function fetchWithTimeout(url, options = {}, timeoutMs = 5000) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
  }
}

function App() {
  const [view, setView] = useState('quote');
  const [products, setProducts] = useState([]);
  const [admin, setAdmin] = useState(null);
  const [loading, setLoading] = useState(true);

  async function loadProducts(includeInactive = false) {
    try {
      const res = await fetchWithTimeout(`/api/products${includeInactive ? '?includeInactive=true' : ''}`, {
        credentials: 'include'
      });
      if (!res.ok) {
        setProducts([]);
        return;
      }
      setProducts(await res.json());
    } catch {
      setProducts([]);
    }
  }

  useEffect(() => {
    Promise.all([
      loadProducts(),
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
          reloadProducts={() => loadProducts(true)}
        />
      ) : (
        <QuoteBuilder products={products.filter((product) => product.active)} />
      )}
    </main>
  );
}

function QuoteBuilder({ products }) {
  const [customer, setCustomer] = useState(blankCustomer);
  const [quantities, setQuantities] = useState({});
  const [query, setQuery] = useState('');
  const [quote, setQuote] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const selectedItems = useMemo(
    () =>
      products
        .filter((product) => quantities[product.id] > 0)
        .map((product) => ({
          ...product,
          quantity: quantities[product.id],
          lineTotal: quantities[product.id] * product.price
        })),
    [products, quantities]
  );
  const subtotal = selectedItems.reduce((sum, item) => sum + item.lineTotal, 0);
  const filteredProducts = products.filter((product) =>
    `${product.reference} ${product.name} ${product.description}`.toLowerCase().includes(query.toLowerCase())
  );

  function setField(field, value) {
    setCustomer((current) => ({ ...current, [field]: value }));
  }

  function updateQty(productId, quantity) {
    const next = Math.max(0, Number.parseInt(quantity, 10) || 0);
    setQuote(null);
    setQuantities((current) => ({ ...current, [productId]: next }));
  }

  async function submitQuote(event) {
    event.preventDefault();
    setSubmitting(true);
    const res = await fetch('/api/quotes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer,
        items: selectedItems.map((item) => ({ productId: item.id, quantity: item.quantity }))
      })
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) return alert(data.message || 'No se pudo crear la cotizacion');
    setQuote(data);
  }

  return (
    <section className="quote-layout">
      <form className="customer-panel" onSubmit={submitQuote}>
        <div>
          <p className="eyebrow">Cotizacion comercial</p>
          <h1>Crea ofertas claras en minutos.</h1>
          <p className="intro">
            Registra los datos del cliente, selecciona productos y genera un PDF listo para enviar.
          </p>
        </div>

        <div className="form-grid">
          <Input label="Proyecto" value={customer.projectName} onChange={(v) => setField('projectName', v)} required />
          <Input label="Cliente" value={customer.clientCompany} onChange={(v) => setField('clientCompany', v)} required />
          <Input label="Dirigido a" value={customer.contactName} onChange={(v) => setField('contactName', v)} required />
          <Input label="E-Mail" type="email" value={customer.email} onChange={(v) => setField('email', v)} required />
          <Input label="Direccion" value={customer.address} onChange={(v) => setField('address', v)} />
          <Input label="Telefono" value={customer.phone} onChange={(v) => setField('phone', v)} />
          <Input label="Celular" value={customer.mobile} onChange={(v) => setField('mobile', v)} />
          <Input label="Centro de costo" value={customer.costCenter} onChange={(v) => setField('costCenter', v)} />
        </div>

        <div className="summary-strip">
          <div>
            <small>Productos</small>
            <strong>{selectedItems.length}</strong>
          </div>
          <div>
            <small>Subtotal</small>
            <strong>{currency.format(subtotal)}</strong>
          </div>
          <button disabled={!selectedItems.length || submitting}>
            {submitting ? 'Enviando...' : 'Enviar cotizacion'}
            <ArrowRight size={18} />
          </button>
        </div>

        {quote && (
          <motion.div className="success-box" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <Check size={18} />
            <span>Oferta #{quote.number} creada.</span>
            <Suspense fallback={<span className="download-link">Preparando PDF</span>}>
              <PdfDownload quote={quote} customer={customer} />
            </Suspense>
          </motion.div>
        )}
      </form>

      <aside className="products-panel">
        <div className="search-box">
          <Search size={18} />
          <input placeholder="Buscar referencia, producto o descripcion" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="product-list">
          {filteredProducts.map((product) => (
            <article className="product-row" key={product.id}>
              <img src={product.imageUrl || '/placeholder-product.svg'} alt="" />
              <div>
                <strong>{product.reference}</strong>
                <span>{product.name}</span>
                <p>{product.description}</p>
              </div>
              <div className="product-price">
                <strong>{currency.format(product.price)}</strong>
                <input
                  aria-label={`Cantidad ${product.reference}`}
                  min="0"
                  type="number"
                  value={quantities[product.id] || ''}
                  placeholder="0"
                  onChange={(event) => updateQty(product.id, event.target.value)}
                />
              </div>
            </article>
          ))}
        </div>
      </aside>
    </section>
  );
}

function AdminPanel({ admin, setAdmin, products, reloadProducts }) {
  const [login, setLogin] = useState({ email: '', password: '' });
  const [product, setProduct] = useState({ reference: '', name: '', description: '', price: '', imageUrl: '', unit: 'und' });
  const [drafts, setDrafts] = useState({});
  const [quotes, setQuotes] = useState([]);

  useEffect(() => {
    if (admin) {
      reloadProducts();
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
            price: item.price
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
    setProduct({ reference: '', name: '', description: '', price: '', imageUrl: '', unit: 'und' });
    reloadProducts();
  }

  async function disableProduct(id) {
    await fetch(`/api/products/${id}`, { method: 'DELETE', credentials: 'include' });
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
        price: draft.price
      })
    });
    const data = await res.json();
    if (!res.ok) return alert(data.message || 'No se pudo actualizar');
    reloadProducts();
  }

  if (!admin) {
    return (
      <section className="admin-login">
        <form onSubmit={signIn}>
          <Shield size={28} />
          <h1>Administrador</h1>
          <Input label="Correo" type="email" value={login.email} onChange={(v) => setLogin((x) => ({ ...x, email: v }))} required />
          <Input label="Contrasena" type="password" value={login.password} onChange={(v) => setLogin((x) => ({ ...x, password: v }))} required />
          <button>
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
        <button className="ghost" onClick={signOut}>
          <LogOut size={18} />
          Salir
        </button>
      </header>

      <div className="admin-grid">
        <form className="product-form" onSubmit={saveProduct}>
          <h2>Nuevo producto</h2>
          <Input label="Referencia" value={product.reference} onChange={(v) => setProduct((x) => ({ ...x, reference: v }))} required />
          <Input label="Nombre" value={product.name} onChange={(v) => setProduct((x) => ({ ...x, name: v }))} required />
          <Input label="Precio" type="number" value={product.price} onChange={(v) => setProduct((x) => ({ ...x, price: v }))} required />
          <Input label="Imagen URL" value={product.imageUrl} onChange={(v) => setProduct((x) => ({ ...x, imageUrl: v }))} />
          <label>
            <span>Descripcion</span>
            <textarea value={product.description} onChange={(e) => setProduct((x) => ({ ...x, description: e.target.value }))} required />
          </label>
          <button>
            <PackagePlus size={18} />
            Crear producto
          </button>
        </form>

        <div className="admin-table">
          <h2>Base de productos</h2>
          {products.map((item) => (
            <div className={!item.active ? 'inactive table-row' : 'table-row'} key={item.id}>
              <span>{item.reference}</span>
              <input
                aria-label={`Nombre ${item.reference}`}
                value={drafts[item.id]?.name || ''}
                onChange={(event) =>
                  setDrafts((current) => ({ ...current, [item.id]: { ...current[item.id], name: event.target.value } }))
                }
              />
              <input
                aria-label={`Precio ${item.reference}`}
                type="number"
                value={drafts[item.id]?.price || ''}
                onChange={(event) =>
                  setDrafts((current) => ({ ...current, [item.id]: { ...current[item.id], price: event.target.value } }))
                }
              />
              <button title="Guardar cambios" onClick={() => updateProduct(item)}>
                <Save size={16} />
              </button>
              <button title="Desactivar" onClick={() => disableProduct(item.id)}>
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="quotes-list">
        <h2>Cotizaciones recibidas</h2>
        {quotes.map((quote) => (
          <article key={quote.id}>
            <Eye size={18} />
            <div>
              <strong>Oferta #{quote.number} · {quote.projectName}</strong>
              <span>{quote.clientCompany} - {quote.contactName} - {quote.email}</span>
            </div>
            <strong>{currency.format(quote.total)}</strong>
          </article>
        ))}
      </div>
    </section>
  );
}

function Input({ label, value, onChange, type = 'text', required = false }) {
  return (
    <label>
      <span>{label}</span>
      <input type={type} value={value} required={required} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

createRoot(document.getElementById('root')).render(<App />);
