import { type INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { ApiKeysModule } from './modules/api-keys/api-keys.module';

const API_TITLE = 'IdentityHub — Oasis REST API';
const API_VERSION = '0.1.0';
const API_BEARER_SCHEME = 'api-key';

// zodToJsonSchema's generic return type is too deep for tsc when the input type
// is generic; bind it to a narrow signature through unknown instead.
const toOpenApiSchema = zodToJsonSchema as unknown as (
  schema: z.ZodType,
  options?: { target: 'openApi3' },
) => unknown;

/**
 * Converts a Zod schema to an OpenAPI 3 schema object so Swagger decorations
 * reuse the validation.ts schemas instead of duplicating shapes.
 */
export function zodSchemaObject<T extends z.ZodType>(schema: T): SchemaObject {
  return toOpenApiSchema(schema, { target: 'openApi3' }) as SchemaObject;
}

/**
 * Registers OpenAPI (Swagger) docs + UI for the API-key machine surface
 * (v1/tickets) plus the session-authed key-management routes. The document is
 * scoped to ApiKeysModule so reviewers land on the REST contract, not the
 * whole app. The UI lives at GET /swagger (raw JSON at /swagger-json).
 *
 * Must be called BEFORE app.init()/listen(): Nest appends a catch-all 404
 * handler during init, so a late setup would get swallowed by it and the UI
 * would 404. Operation paths already carry the global `/api` prefix.
 */
export function setupSwagger(app: INestApplication, path = 'swagger'): void {
  const config = new DocumentBuilder()
    .setTitle(API_TITLE)
    .setDescription(
      'Machine-facing REST API for IdentityHub — Oasis. Authenticate with an ' +
        'API key sent as an HTTP `Authorization: Bearer <key>` header (use the ' +
        'Authorize button in the UI). Mint/revoke keys and tie them to a Jira ' +
        'service account under Settings → API keys; those management routes are ' +
        'session-authed and listed here for reference.',
    )
    .setVersion(API_VERSION)
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'opaque API key' },
      API_BEARER_SCHEME,
    )
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    include: [ApiKeysModule],
  });
  SwaggerModule.setup(path, app, document, {
    explorer: true,
    swaggerOptions: { persistAuthorization: true },
    customSiteTitle: API_TITLE,
  });
}
