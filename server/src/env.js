import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

/** 与 server/src/index.js 同目录，固定加载 server/.env（不依赖 process.cwd） */
const __srcDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__srcDir, '..', '.env') });
