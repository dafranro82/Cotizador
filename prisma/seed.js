import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const products = [
  {
    reference: 'K_INST_ELEC',
    name: 'Instalacion electrica',
    description: 'Instalacion de toma electrica, voz o telefono. No incluye materiales.',
    price: 12840,
    imageUrl: 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=400&q=80'
  },
  {
    reference: 'CAR_15_BL',
    name: 'Toma corriente Lutron',
    description: 'Toma corriente en color negro. Marca: Lutron.',
    price: 15400,
    imageUrl: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=400&q=80'
  },
  {
    reference: 'K_CABLE_UTP',
    name: 'Cableado UTP Cat 6',
    description: 'Punto de red certificado con cable UTP categoria 6.',
    price: 52000,
    imageUrl: 'https://images.unsplash.com/photo-1603732551658-5fabbafa84eb?auto=format&fit=crop&w=400&q=80'
  }
];

for (const product of products) {
  await prisma.product.upsert({
    where: { reference: product.reference },
    update: product,
    create: product
  });
}

console.log(`Seed listo: ${products.length} productos.`);
await prisma.$disconnect();
