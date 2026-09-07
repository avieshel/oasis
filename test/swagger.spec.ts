import type { Server } from 'node:http';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { setupSwagger } from '../src/swagger';

interface OpenApiDocument {
  paths: Record<string, unknown>;
  components?: {
    securitySchemes?: Record<string, unknown>;
  };
}

describe('swagger (OpenAPI) docs', () => {
  let server: Server;

  beforeAll(async () => {
    const app = await NestFactory.create(AppModule, { bufferLogs: true });
    app.setGlobalPrefix('api', { exclude: ['healthz', 'readyz'] });
    setupSwagger(app);
    await app.init();
    server = app.getHttpServer() as Server;
  });

  afterAll(() => {
    void server.close();
  });

  it('serves the Swagger UI at GET /swagger', async () => {
    const res = await request(server).get('/swagger').expect(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('swagger-ui');
  });

  it('exposes the machine REST contract in the JSON document', async () => {
    const res = await request(server).get('/swagger-json').expect(200);
    const doc = res.body as OpenApiDocument;

    expect(doc.paths['/api/v1/tickets']).toBeDefined();
    expect(doc.paths['/api/v1/tickets/recent']).toBeDefined();
    expect(doc.paths['/api/app/api-keys']).toBeDefined();

    const create = (
      doc.paths['/api/v1/tickets'] as {
        post: Record<string, unknown>;
      }
    ).post;
    expect(create).toBeDefined();
    expect(create.security).toContainEqual({ 'api-key': [] });
    expect((create.requestBody as { content: unknown }).content).toBeDefined();
    expect((create.responses as Record<string, unknown>)['201']).toBeDefined();
    expect((create.responses as Record<string, unknown>)['401']).toBeDefined();

    const recent = (
      doc.paths['/api/v1/tickets/recent'] as {
        get: { parameters: unknown[] };
      }
    ).get;
    expect(recent).toBeDefined();
    expect(recent.parameters.length).toBeGreaterThanOrEqual(2);
  });

  it('makes the documented machine routes reachable under /api', async () => {
    await request(server)
      .get('/api/v1/tickets/recent?project_key=OASIS')
      .expect(401);
  });

  it('declares the bearer api-key security scheme', async () => {
    const res = await request(server).get('/swagger-json').expect(200);
    const doc = res.body as OpenApiDocument;
    expect(doc.components?.securitySchemes?.['api-key']).toBeDefined();
  });
});
