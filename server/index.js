import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const prisma = new PrismaClient();
const port = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';
const DEFAULT_TRM = 4000;
const productImages = loadProductImages();

const requiredEnv = ['DATABASE_URL', 'JWT_SECRET', 'ADMIN_EMAIL', 'ADMIN_PASSWORD'];
for (const key of requiredEnv) {
  if (!process.env[key]) {
    console.warn(`[config] Falta ${key}. Configuralo antes de desplegar.`);
  }
}

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: isProduction,
  maxAge: 1000 * 60 * 60 * 8
};

function loadProductImages() {
  const candidates = [
    path.join(__dirname, '..', 'dist', 'product-images', 'manifest.json'),
    path.join(__dirname, '..', 'public', 'product-images', 'manifest.json')
  ];

  for (const manifestPath of candidates) {
    if (fs.existsSync(manifestPath)) {
      try {
        return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      } catch (error) {
        console.warn(`[config] No se pudo leer ${manifestPath}: ${error.message}`);
      }
    }
  }

  return {};
}

function normalizeReference(value) {
  return String(value || '').trim().toUpperCase();
}

function usableImageUrl(value) {
  const imageUrl = String(value || '').trim();
  if (!imageUrl) return null;
  if (imageUrl.startsWith('/')) return imageUrl;

  try {
    const url = new URL(imageUrl);
    return /\.(avif|gif|jpe?g|png|svg|webp)$/i.test(url.pathname) ? imageUrl : null;
  } catch {
    return null;
  }
}

function normalizeProduct(product) {
  const reference = normalizeReference(product.reference);
  return {
    ...product,
    price: Number(product.price),
    currency: product.currency || 'COP',
    imageUrl: productImages[reference] || usableImageUrl(product.imageUrl)
  };
}

function normalizeQuote(quote) {
  return {
    ...quote,
    subtotal: Number(quote.subtotal),
    tax: Number(quote.tax),
    total: Number(quote.total),
    trm: Number(quote.trm),
    currency: quote.currency || 'COP',
    items: quote.items?.map((item) => ({
      ...item,
      unitPrice: Number(item.unitPrice),
      lineTotal: Number(item.lineTotal)
    }))
  };
}

async function getTrm() {
  const setting = await prisma.appSetting.findUnique({ where: { key: 'TRM' } });
  const trm = Number(setting?.value);
  return Number.isFinite(trm) && trm > 0 ? trm : DEFAULT_TRM;
}

function convertPrice(price, fromCurrency, toCurrency, trm) {
  const amount = Number(price);
  const source = fromCurrency === 'USD' ? 'USD' : 'COP';
  const target = toCurrency === 'USD' ? 'USD' : 'COP';
  if (source === target) return amount;
  if (source === 'USD' && target === 'COP') return amount * trm;
  return amount / trm;
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function getToken(req) {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return req.cookies.admin_token;
}

function requireAdmin(req, res, next) {
  try {
    if (!process.env.JWT_SECRET) {
      return res.status(503).json({ message: 'Autenticacion no configurada' });
    }
    const token = getToken(req);
    if (!token) return res.status(401).json({ message: 'Sesion requerida' });
    req.admin = jwt.verify(token, process.env.JWT_SECRET);
    return next();
  } catch {
    return res.status(401).json({ message: 'Sesion invalida' });
  }
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'komodo-cotizador' });
});

app.get('/api/settings', async (_req, res) => {
  const trm = await getTrm();
  res.json({ trm, defaultCurrency: 'COP' });
});

app.put('/api/settings/trm', requireAdmin, async (req, res) => {
  const trm = Number(req.body.trm);
  if (!Number.isFinite(trm) || trm <= 0) {
    return res.status(400).json({ message: 'TRM invalida' });
  }
  const setting = await prisma.appSetting.upsert({
    where: { key: 'TRM' },
    update: { value: String(roundMoney(trm)) },
    create: { key: 'TRM', value: String(roundMoney(trm)) }
  });
  res.json({ trm: Number(setting.value) });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  const jwtSecret = process.env.JWT_SECRET;

  if (!adminEmail || !adminPassword || !jwtSecret) {
    return res.status(503).json({ message: 'Credenciales de admin no configuradas' });
  }

  const passwordMatches = adminPassword.startsWith('$2')
    ? await bcrypt.compare(password || '', adminPassword)
    : password === adminPassword;

  if (email !== adminEmail || !passwordMatches) {
    return res.status(401).json({ message: 'Credenciales invalidas' });
  }

  const token = jwt.sign({ email, role: 'admin' }, jwtSecret, {
    expiresIn: '8h'
  });
  res.cookie('admin_token', token, cookieOptions);
  res.json({ admin: { email } });
});

app.post('/api/auth/logout', (_req, res) => {
  res.clearCookie('admin_token');
  res.json({ ok: true });
});

app.get('/api/auth/me', requireAdmin, (req, res) => {
  res.json({ admin: { email: req.admin.email } });
});

app.get('/api/products', async (req, res) => {
  const includeInactive = req.query.includeInactive === 'true';
  const products = await prisma.product.findMany({
    where: includeInactive ? undefined : { active: true },
    orderBy: [{ active: 'desc' }, { reference: 'asc' }]
  });
  res.json(products.map(normalizeProduct));
});

app.post('/api/products', requireAdmin, async (req, res) => {
  const product = await prisma.product.create({
    data: productPayload(req.body)
  });
  res.status(201).json(normalizeProduct(product));
});

app.put('/api/products/:id', requireAdmin, async (req, res) => {
  const product = await prisma.product.update({
    where: { id: req.params.id },
    data: productPayload(req.body)
  });
  res.json(normalizeProduct(product));
});

app.delete('/api/products/:id', requireAdmin, async (req, res) => {
  await prisma.product.update({
    where: { id: req.params.id },
    data: { active: false }
  });
  res.json({ ok: true });
});

function productPayload(body) {
  const price = Number(body.price);
  if (!body.reference || !body.name || !body.description || Number.isNaN(price)) {
    const error = new Error('Producto incompleto');
    error.status = 400;
    throw error;
  }
  return {
    reference: String(body.reference).trim().toUpperCase(),
    name: String(body.name).trim(),
    description: String(body.description).trim(),
    price,
    currency: body.currency === 'USD' ? 'USD' : 'COP',
    imageUrl: body.imageUrl ? String(body.imageUrl).trim() : null,
    unit: body.unit ? String(body.unit).trim() : 'und',
    active: Boolean(body.active ?? true)
  };
}

app.post('/api/quotes', async (req, res) => {
  const { customer, items } = req.body;
  const quoteCurrency = req.body.currency === 'USD' ? 'USD' : 'COP';
  const trm = await getTrm();
  if (!customer?.projectName || !customer?.clientCompany || !customer?.contactName || !customer?.email) {
    return res.status(400).json({ message: 'Faltan datos del cliente' });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: 'Selecciona al menos un producto' });
  }

  const productIds = items.map((item) => item.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, active: true }
  });
  const byId = new Map(products.map((product) => [product.id, product]));

  const quoteItems = items.map((item) => {
    const product = byId.get(item.productId);
    const quantity = Math.max(1, Number.parseInt(item.quantity, 10) || 1);
    if (!product) throw Object.assign(new Error('Producto no disponible'), { status: 400 });
    const unitPrice = roundMoney(convertPrice(product.price, product.currency, quoteCurrency, trm));
    return {
      productId: product.id,
      reference: product.reference,
      name: product.name,
      description: product.description,
      quantity,
      unitPrice,
      lineTotal: roundMoney(unitPrice * quantity)
    };
  });

  const subtotal = roundMoney(quoteItems.reduce((sum, item) => sum + item.lineTotal, 0));
  const tax = 0;
  const total = subtotal + tax;

  const quote = await prisma.quote.create({
    data: {
      projectName: customer.projectName,
      clientCompany: customer.clientCompany,
      contactName: customer.contactName,
      address: customer.address || '',
      phone: customer.phone || '',
      mobile: customer.mobile || '',
      email: customer.email,
      costCenter: customer.costCenter || '',
      subtotal,
      tax,
      total,
      currency: quoteCurrency,
      trm,
      items: { create: quoteItems }
    },
    include: { items: true }
  });

  res.status(201).json(normalizeQuote(quote));
});

app.get('/api/quotes', requireAdmin, async (_req, res) => {
  const quotes = await prisma.quote.findMany({
    include: { items: true },
    orderBy: { createdAt: 'desc' },
    take: 100
  });
  res.json(quotes.map(normalizeQuote));
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ message: err.message || 'Error interno' });
});

const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));
app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(port, () => {
  console.log(`Komodo Cotizador escuchando en puerto ${port}`);
});
