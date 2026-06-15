# Komodo Cotizador

Cotizador online ligero para Komodo: clientes crean cotizaciones con productos, subtotales y PDF descargable; administradores gestionan productos, precios y revisan cotizaciones recibidas.

## Stack

- React 19 + Vite
- Express 5
- Prisma + PostgreSQL
- PDF en cliente con `@react-pdf/renderer`
- Listo para Railway con `railway.json`

## Desarrollo local

1. Instala dependencias:

   ```bash
   npm install
   ```

2. Copia variables:

   ```bash
   cp .env.example .env
   ```

3. Configura `DATABASE_URL`, `JWT_SECRET`, `ADMIN_EMAIL` y `ADMIN_PASSWORD`.

4. Crea tablas y datos demo:

   ```bash
   npm run db:push
   npm run db:seed
   ```

5. Corre la app:

   ```bash
   npm run dev
   ```

Cliente: `http://localhost:5173`

Backend: `http://localhost:3000`

## Despliegue en Railway

1. Crea un proyecto en Railway.
2. Agrega un servicio PostgreSQL.
3. Conecta este repositorio como servicio web.
4. Define las variables:

   ```env
   DATABASE_URL=...
   JWT_SECRET=...
   ADMIN_EMAIL=...
   ADMIN_PASSWORD=...
   PUBLIC_COMPANY_NAME=Komodo
   PUBLIC_COMPANY_EMAIL=cotizaciones@komodotech.com.co
   PUBLIC_COMPANY_PHONE=+57 300 000 0000
   ```

Railway ejecuta `npm run db:push && npm start` al iniciar, por lo que crea o actualiza las tablas automáticamente.

## Uso

- En `Cotizar`, el cliente llena proyecto, cliente, contacto, direccion, telefono, celular y correo.
- Despues de completar los datos, selecciona productos por cantidad, cambia entre COP/USD, envia la cotizacion y descarga el PDF.
- En `Admin`, ingresa con `ADMIN_EMAIL` y `ADMIN_PASSWORD`.
- El admin puede modificar la TRM, crear productos, editar nombre/precio/moneda, desactivar productos y ver cotizaciones recibidas.

Credenciales por defecto si no defines variables:

```txt
Correo: admin@komodo.com
Clave: admin12345
```

En produccion cambia `ADMIN_EMAIL`, `ADMIN_PASSWORD` y `JWT_SECRET` en Railway.
