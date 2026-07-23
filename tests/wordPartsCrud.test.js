import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { createListHandler, createItemHandler } = require('../lib/wordPartsCrud');

function makeRes() {
  const res = { statusCode: null, body: null, ended: false };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  res.end = () => { res.ended = true; return res; };
  return res;
}

describe('createListHandler', () => {
  const handleList = createListHandler('roots', 'root');

  it('GET returns the list under the table name', async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          order: async () => ({ data: [{ id: 1, root: 'act', meaning: 'hành động' }], error: null }),
        }),
      }),
    };
    const req = { method: 'GET' };
    const res = makeRes();
    await handleList(req, res, supabase);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ roots: [{ id: 1, root: 'act', meaning: 'hành động' }] });
  });

  it('POST creates a row and returns it under the singular key', async () => {
    const supabase = {
      from: () => ({
        insert: (row) => ({
          select: () => ({
            single: async () => ({ data: { id: 2, ...row }, error: null }),
          }),
        }),
      }),
    };
    const req = { method: 'POST', body: { root: ' spect ', meaning: 'nhìn' } };
    const res = makeRes();
    await handleList(req, res, supabase);
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({ root: { id: 2, root: 'spect', meaning: 'nhìn' } });
  });

  it('POST rejects a blank root without touching supabase', async () => {
    const req = { method: 'POST', body: { root: '   ' } };
    const res = makeRes();
    await handleList(req, res, {});
    expect(res.statusCode).toBe(400);
  });

  it('rejects unsupported methods', async () => {
    const req = { method: 'DELETE' };
    const res = makeRes();
    await handleList(req, res, {});
    expect(res.statusCode).toBe(405);
  });
});

describe('createItemHandler', () => {
  const handleItem = createItemHandler('roots', 'root');

  it('PUT updates the row and returns it under the singular key', async () => {
    const supabase = {
      from: () => ({
        update: (row) => ({
          eq: () => ({
            select: () => ({
              single: async () => ({ data: { id: 3, ...row }, error: null }),
            }),
          }),
        }),
      }),
    };
    const req = { method: 'PUT', body: { root: 'act', meaning: 'hành động' } };
    const res = makeRes();
    await handleItem(req, res, supabase, 3);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ root: { id: 3, root: 'act', meaning: 'hành động' } });
  });

  it('DELETE removes the row and returns 204', async () => {
    const supabase = {
      from: () => ({
        delete: () => ({ eq: async () => ({ error: null }) }),
      }),
    };
    const req = { method: 'DELETE' };
    const res = makeRes();
    await handleItem(req, res, supabase, 3);
    expect(res.statusCode).toBe(204);
    expect(res.ended).toBe(true);
  });
});
