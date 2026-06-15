import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const productsPath = path.join(__dirname, 'products.seed.json');
const products = JSON.parse(await fs.readFile(productsPath, 'utf8'));

const batchSize = 100;
let imported = 0;

for (let i = 0; i < products.length; i += batchSize) {
  const batch = products.slice(i, i + batchSize);
  await prisma.$transaction(
    batch.map((product) =>
      prisma.product.upsert({
        where: { reference: product.reference },
        update: {
          name: product.name,
          description: product.description,
          price: product.price,
          imageUrl: product.imageUrl,
          unit: product.unit,
          active: product.active
        },
        create: {
          reference: product.reference,
          name: product.name,
          description: product.description,
          price: product.price,
          imageUrl: product.imageUrl,
          unit: product.unit,
          active: product.active
        }
      })
    )
  );
  imported += batch.length;
  console.log(`Importados ${imported}/${products.length} productos...`);
}

console.log(`Seed listo: ${products.length} productos desde products.seed.json.`);
await prisma.$disconnect();
