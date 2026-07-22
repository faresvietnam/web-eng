// tests/auth.test.js
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { requireUser } = require('../lib/auth');

function makeRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

describe('requireUser', () => {
  it('returns null and responds 401 when Authorization header is missing', () => {
    const req = { headers: {} };
    const res = makeRes();
    const token = requireUser(req, res);
    expect(token).toBeNull();
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Thiếu access token' });
  });

  it('returns null and responds 401 when header is not Bearer format', () => {
    const req = { headers: { authorization: 'Basic abc123' } };
    const res = makeRes();
    const token = requireUser(req, res);
    expect(token).toBeNull();
    expect(res.statusCode).toBe(401);
  });

  it('returns the token when header is valid Bearer format', () => {
    const req = { headers: { authorization: 'Bearer my-jwt-token' } };
    const res = makeRes();
    const token = requireUser(req, res);
    expect(token).toBe('my-jwt-token');
    expect(res.statusCode).toBeNull();
  });
});
