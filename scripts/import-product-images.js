import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import sharp from 'sharp';

const require = createRequire(import.meta.url);
const yauzl = require('yauzl');

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.jfif', '.bmp']);
const THUMBNAIL_SIZE = 192;
const CONCURRENCY = Number(process.env.IMAGE_IMPORT_CONCURRENCY || 4);

const zipPath = process.argv[2];
const productsPath = process.argv[3] || 'prisma/products.seed.json';
const outputDir = process.argv[4] || 'public/product-images';

if (!zipPath) {
  console.error('Uso: npm run images:import -- <ruta-al-zip> [products.seed.json] [directorio-salida]');
  process.exit(1);
}

function normalizeReference(value) {
  return String(value || '').trim().replace(/^_+/, '').toUpperCase();
}

function imageFileName(reference) {
  return `${encodeURIComponent(reference)}.webp`;
}

function openZip(file) {
  return new Promise((resolve, reject) => {
    yauzl.open(file, { lazyEntries: true, autoClose: false }, (error, zipFile) => {
      if (error) reject(error);
      else resolve(zipFile);
    });
  });
}

function readEntry(zipFile, entry) {
  return new Promise((resolve, reject) => {
    zipFile.openReadStream(entry, (error, stream) => {
      if (error) {
        reject(error);
        return;
      }
      const chunks = [];
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('error', reject);
      stream.on('end', () => resolve(Buffer.concat(chunks)));
    });
  });
}

async function collectImageEntries(zipFile, references) {
  const bestByReference = new Map();

  return new Promise((resolve, reject) => {
    zipFile.readEntry();

    zipFile.on('entry', (entry) => {
      const baseName = path.basename(entry.fileName);
      const extension = path.extname(baseName).toLowerCase();
      const reference = normalizeReference(path.basename(baseName, extension));

      if (!/\/$/.test(entry.fileName) && IMAGE_EXTENSIONS.has(extension) && references.has(reference)) {
        const current = bestByReference.get(reference);
        if (!current || entry.uncompressedSize > current.uncompressedSize) {
          bestByReference.set(reference, entry);
        }
      }

      zipFile.readEntry();
    });

    zipFile.on('end', () => resolve(bestByReference));
    zipFile.on('error', reject);
  });
}

async function main() {
  const products = JSON.parse(fs.readFileSync(productsPath, 'utf8'));
  const references = new Set(products.map((product) => normalizeReference(product.reference)).filter(Boolean));
  const zipFile = await openZip(zipPath);
  const imageEntries = await collectImageEntries(zipFile, references);
  const manifest = {};
  const failures = [];
  const failuresPath = path.join(process.cwd(), 'product-image-failures.json');

  fs.mkdirSync(outputDir, { recursive: true });

  const referencesToProcess = [...imageEntries.keys()].sort((a, b) => a.localeCompare(b));
  let cursor = 0;

  async function processNext() {
    while (cursor < referencesToProcess.length) {
      const reference = referencesToProcess[cursor];
      cursor += 1;
      await processReference(reference);
    }
  }

  async function processReference(reference) {
    const entry = imageEntries.get(reference);
    try {
      const fileName = imageFileName(reference);
      const outputPath = path.join(outputDir, fileName);
      if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
        manifest[reference] = `/product-images/${fileName}`;
        return;
      }

      const input = await readEntry(zipFile, entry);

      await sharp(input, { failOn: 'none' })
        .rotate()
        .resize({
          width: THUMBNAIL_SIZE,
          height: THUMBNAIL_SIZE,
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 0 }
        })
        .webp({ quality: 84, effort: 5 })
        .toFile(outputPath);

      manifest[reference] = `/product-images/${fileName}`;
    } catch (error) {
      failures.push({ reference, file: entry.fileName, message: error.message });
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, CONCURRENCY) }, () => processNext()));

  fs.writeFileSync(path.join(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(
    JSON.stringify(
      {
        products: products.length,
        references: references.size,
        matched: imageEntries.size,
        generated: Object.keys(manifest).length,
        failures: failures.length,
        outputDir
      },
      null,
      2
    )
  );

  if (failures.length) {
    fs.writeFileSync(failuresPath, `${JSON.stringify(failures, null, 2)}\n`);
    console.warn(`Algunas imagenes no se pudieron procesar. Revisa ${failuresPath}`);
  } else {
    fs.rmSync(failuresPath, { force: true });
  }

  zipFile.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
