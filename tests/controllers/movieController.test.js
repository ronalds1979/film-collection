import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { updateMovie } from '../../apps/api/server/controllers/movieController.js';
import { ingestMovieSchema, isSafeHttpUrl, isSafeHttpsUrl } from '../../apps/api/server/schemas/movie.js';
import { readBoundedJson, toTmdbResult } from '../../apps/api/server/services/metadata.js';

test('updateMovie validation', async (t) => {
  await t.test('should return 400 if movie ID is not a number', async () => {
    const req = { params: { id: 'invalid' }, body: {} };
    let statusCode;
    let jsonResponse;
    const res = {
      status: (code) => {
        statusCode = code;
        return res;
      },
      json: (data) => {
        jsonResponse = data;
        return res;
      }
    };

    await updateMovie(req, res);

    assert.equal(statusCode, 400);
    assert.deepEqual(jsonResponse, { message: 'A valid movie ID is required.' });
  });

  await t.test('should return 400 if movie ID is less than 1', async () => {
    const req = { params: { id: '0' }, body: {} };
    let statusCode;
    let jsonResponse;
    const res = {
      status: (code) => {
        statusCode = code;
        return res;
      },
      json: (data) => {
        jsonResponse = data;
        return res;
      }
    };

    await updateMovie(req, res);

    assert.equal(statusCode, 400);
    assert.deepEqual(jsonResponse, { message: 'A valid movie ID is required.' });
  });
});

test('URL validation blocks loopback, private ranges, credentials, and non-HTTPS where required', () => {
  assert.equal(isSafeHttpUrl('https://image.tmdb.org/t/p/w500/poster.jpg'), true);
  assert.equal(isSafeHttpUrl('http://example.com/poster.jpg'), true);
  assert.equal(isSafeHttpsUrl('http://example.com/poster.jpg'), false);
  assert.equal(isSafeHttpsUrl('https://m.media-amazon.com/images/M/poster.jpg'), true);

  for (const unsafeUrl of [
    'http://localhost:3000/secret',
    'https://127.0.0.1/admin',
    'http://10.0.0.1/metadata',
    'https://192.168.1.10/cover.jpg',
    'http://169.254.169.254/latest/meta-data/',
    'http://172.16.0.1/internal',
    'http://100.64.0.1/cgnat',
    'http://198.18.0.1/bench',
    'http://224.0.0.1/multicast',
    'https://metadata.internal/token',
    'https://metadata.internal./token',
    'http://printer.local/status',
    'http://printer.local./status',
    'https://localhost./admin',
    'https://sub.localhost./admin',
    'https://127.0.0.1./cover.jpg',
    'http://[::1]:8080/',
    'http://[::ffff:127.0.0.1]/',
    'https://[::127.0.0.1]/',
    'https://[::169.254.169.254]/',
    'https://[::7f00:1]/',
    'https://[::0.0.0.255]/',
    'https://[fe90::1]/',
    'https://[64:ff9b::127.0.0.1]/',
    'http://[ff02::1]/',
    'https://user:pass@example.com/poster.jpg',
    'javascript:alert(1)',
  ]) {
    assert.equal(isSafeHttpUrl(unsafeUrl), false, `Expected isSafeHttpUrl to reject ${unsafeUrl}`);
    assert.equal(isSafeHttpsUrl(unsafeUrl), false, `Expected isSafeHttpsUrl to reject ${unsafeUrl}`);
  }

  // Ensure normal domains starting with fc/fd/ff and public IPv6 addresses are not falsely blocked
  assert.equal(isSafeHttpsUrl('https://ff.example.com/poster.jpg'), true);
  assert.equal(isSafeHttpsUrl('https://[2606:4700:4700::1111]/poster.jpg'), true);

  const parsed = ingestMovieSchema.safeParse({
    title: 'Test Movie',
    posterPath: 'http://169.254.169.254/latest/meta-data/',
  });
  assert.equal(parsed.success, false);
});

test('ingestMovieSchema returns expected validation messages', () => {
  const badDiscCount = ingestMovieSchema.safeParse({ title: 'Test', discCount: 'not-a-number' });
  assert.equal(badDiscCount.success, false);
  assert.equal(badDiscCount.error.errors[0].message, 'Disc count must be a non-negative whole number.');

  const badFormatId = ingestMovieSchema.safeParse({ title: 'Test', formatId: 1 });
  assert.equal(badFormatId.success, false);
  assert.equal(badFormatId.error.errors[0].message, 'formatId must be a text identifier.');

  const badPrice = ingestMovieSchema.safeParse({ title: 'Test', purchasePrice: -5 });
  assert.equal(badPrice.success, false);
  assert.equal(badPrice.error.errors[0].message, 'Purchase price must be a non-negative amount.');

  const badGenres = ingestMovieSchema.safeParse({ title: 'Test', genreIds: 'GEN01' });
  assert.equal(badGenres.success, false);
  assert.equal(badGenres.error.errors[0].message, 'genreIds must be an array of genre identifiers.');
});

test('toTmdbResult sanitizes external poster_path, backdrop_path, and imdb_id', () => {
  const safe = toTmdbResult({
    id: 644,
    title: 'A.I.',
    poster_path: '/abc123.jpg',
    backdrop_path: 'https://image.tmdb.org/t/p/original/xyz.png',
    imdb_id: 'tt0212720',
  });
  assert.equal(safe.poster_path, '/abc123.jpg');
  assert.equal(safe.backdrop_path, 'https://image.tmdb.org/t/p/original/xyz.png');
  assert.equal(safe.imdb_id, 'tt0212720');

  const malicious = toTmdbResult({
    id: 644,
    title: 'A.I.',
    poster_path: '//evil.example.com/steal.png',
    backdrop_path: 'http://127.0.0.1/ssrf.jpg',
    imdb_id: '../admin',
  });
  assert.equal(malicious.poster_path, null);
  assert.equal(malicious.backdrop_path, null);
  assert.equal(malicious.imdb_id, null);
});

test('readBoundedJson rejects oversized Content-Length and streamed responses', async () => {
  const headerRejected = new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Content-Length': '9999999' },
  });
  await assert.rejects(() => readBoundedJson(headerRejected, 1024), /exceeded maximum allowed size/i);

  const oversizedStream = new Response('{"data":"' + 'a'.repeat(2048) + '"}', {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
  await assert.rejects(() => readBoundedJson(oversizedStream, 1024), /exceeded maximum allowed size/i);

  const validResponse = new Response(JSON.stringify({ results: [1, 2, 3] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
  assert.deepEqual(await readBoundedJson(validResponse, 1024), { results: [1, 2, 3] });
});

test('POST /api/upload-cover returns 400 instead of crashing when req.body is undefined', async () => {
  const { app, prisma } = await import('../../apps/api/server/index.js');
  const server = app.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const response = await fetch(`http://127.0.0.1:${address.port}/api/upload-cover`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: 'not-multipart',
    });
    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(payload.success, false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await prisma.$disconnect().catch(() => {});
  }
});

test('GET /uploads returns 404 JSON instead of SPA HTML when cover file is missing', async () => {
  const { app, prisma } = await import('../../apps/api/server/index.js');
  const server = app.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const response = await fetch(`http://127.0.0.1:${address.port}/uploads/nonexistent-cover.jpg`);
    assert.equal(response.status, 404);
    const payload = await response.json();
    assert.equal(payload.success, false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await prisma.$disconnect().catch(() => {});
  }
});
