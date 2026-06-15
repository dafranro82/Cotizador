import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const prisma = new PrismaClient();
const port = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

const requiredEnv = ['DATABASE_URL', 'JWT_SECRET'];
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

function normalizeProduct(product) {
  return {
    ...product,
    price: Number(product.price)
  };
}

function normalizeQuote(quote) {
  return {
    ...quote,
    subtotal: Number(quote.subtotal),
    tax: Number(quote.tax),
    total: Number(quote.total),
    items: quote.items?.map((item) => ({
      ...item,
      unitPrice: Number(item.unitPrice),
      lineTotal: Number(item.lineTotal)
    }))
  };
}

function getToken(req) {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return req.cookies.admin_token;
}

function requireAdmin(req, res, next) {
  try {
    const token = getToken(req);
    if (!token) return res.status(401).json({ message: 'Sesion requerida' });
    req.admin = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
    return next();
  } catch {
    return res.status(401).json({ message: 'Sesion invalida' });
  }
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'komodo-cotizador' });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@komodo.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin12345';
  const passwordMatches = adminPassword.startsWith('$2')
    ? await bcrypt.compare(password || '', adminPassword)
    : password === adminPassword;

  if (email !== adminEmail || !passwordMatches) {
    return res.status(401).json({ message: 'Credenciales invalidas' });
  }

  const token = jwt.sign({ email, role: 'admin' }, process.env.JWT_SECRET || 'dev-secret', {
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
    imageUrl: body.imageUrl ? String(body.imageUrl).trim() : null,
    unit: body.unit ? String(body.unit).trim() : 'und',
    active: Boolean(body.active ?? true)
  };
}

app.post('/api/quotes', async (req, res) => {
  const { customer, items } = req.body;
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
    const unitPrice = Number(product.price);
    return {
      productId: product.id,
      reference: product.reference,
      name: product.name,
      description: product.description,
      quantity,
      unitPrice,
      lineTotal: unitPrice * quantity
    };
  });

  const subtotal = quoteItems.reduce((sum, item) => sum + item.lineTotal, 0);
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
