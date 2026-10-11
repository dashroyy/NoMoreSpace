// Writes tools/art/portraits.json from the portrait table (see portrait-table.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PORTRAITS } from './portrait-table.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const spec = Object.entries(PORTRAITS).map(([name, src]) => ({ name, ...src }));
fs.writeFileSync(path.join(HERE, 'portraits.json'), JSON.stringify(spec));
console.log(`${spec.length} portraits`);
