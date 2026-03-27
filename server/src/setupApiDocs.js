import path from 'path';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * 挂载 OpenAPI 原始文件与 Swagger UI（需 ENABLE_API_DOCS=true）。
 */
export function mountApiDocs(app) {
  const yamlPath = path.join(__dirname, '../../docs/openapi.yaml');
  const raw = readFileSync(yamlPath, 'utf8');
  const doc = YAML.parse(raw);

  app.get('/openapi.yaml', (_req, res) => {
    res.type('application/yaml; charset=utf-8').send(raw);
  });

  app.use(
    '/api-docs',
    swaggerUi.serve,
    swaggerUi.setup(doc, {
      customSiteTitle: 'qc-report API',
      swaggerOptions: {
        persistAuthorization: true,
        filter: true
      }
    })
  );
}
