// tests/componentsCrud.test.js
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { handleList, handleItem } = require('../lib/componentsCrud');

function makeRes() {
  const res = { statusCode: null, body: null, ended: false };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  res.end = () => { res.ended = true; return res; };
  return res;
}

describe('handleList', () => {
  it('GET with a valid type returns components filtered by that type', async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: (col, val) => {
            expect(col).toBe('component_type');
            expect(val).toBe('root');
            return {
              order: async () => ({
                data: [{ id: 1, component_type: 'root', text: 'act', meaning: 'hành động', root_subtype: null }],
                error: null,
              }),
            };
          },
        }),
      }),
    };
    const req = { method: 'GET', query: { type: 'root' } };
    const res = makeRes();
    await handleList(req, res, supabase);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ components: [{ id: 1, component_type: 'root', text: 'act', meaning: 'hành động', root_subtype: null }] });
  });

  it('GET with a missing or invalid type is rejected', async () => {
    const req = { method: 'GET', query: {} };
    const res = makeRes();
    await handleList(req, res, {});
    expect(res.statusCode).toBe(400);
  });

  it('POST creates a component with the given type', async () => {
    const supabase = {
      from: () => ({
        insert: (row) => ({
          select: () => ({
            single: async () => ({ data: { id: 2, ...row }, error: null }),
          }),
        }),
      }),
    };
    const req = { method: 'POST', body: { component_type: 'root', text: ' spect ', meaning: 'nhìn', root_subtype: 'bound_root' } };
    const res = makeRes();
    await handleList(req, res, supabase);
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({
      component: { id: 2, component_type: 'root', text: 'spect', meaning: 'nhìn', root_subtype: 'bound_root' },
    });
  });

  it('POST ignores root_subtype for non-root types', async () => {
    const supabase = {
      from: () => ({
        insert: (row) => ({
          select: () => ({
            single: async () => ({ data: { id: 3, ...row }, error: null }),
          }),
        }),
      }),
    };
    const req = { method: 'POST', body: { component_type: 'prefix', text: 'un', root_subtype: 'free_root' } };
    const res = makeRes();
    await handleList(req, res, supabase);
    expect(res.body.component.root_subtype).toBeNull();
  });

  it('POST rejects a blank text without touching supabase', async () => {
    const req = { method: 'POST', body: { component_type: 'root', text: '   ' } };
    const res = makeRes();
    await handleList(req, res, {});
    expect(res.statusCode).toBe(400);
  });

  it('rejects unsupported methods', async () => {
    const req = { method: 'DELETE', query: { type: 'root' } };
    const res = makeRes();
    await handleList(req, res, {});
    expect(res.statusCode).toBe(405);
  });
});

describe('handleItem', () => {
  it('PUT updates the row and returns it under "component"', async () => {
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
    const req = { method: 'PUT', body: { component_type: 'root', text: 'act', meaning: 'hành động', root_subtype: 'free_root' } };
    const res = makeRes();
    await handleItem(req, res, supabase, 3);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ component: { id: 3, text: 'act', meaning: 'hành động', root_subtype: 'free_root' } });
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
