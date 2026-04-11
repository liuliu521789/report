import 'dotenv/config';
import { pingDb } from '../src/db/pool.js';
import { ensureSalesModuleTables, ensureSalesContractDocumentColumns } from '../src/db/ensureSchema.js';

async function main() {
  await pingDb();
  await ensureSalesModuleTables();
  await ensureSalesContractDocumentColumns();
  // eslint-disable-next-line no-console
  console.log('[ensure-sales-schema] OK: sales tables + document contract columns applied.');
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error('[ensure-sales-schema] FAILED:', e?.message || e);
  process.exit(1);
});
