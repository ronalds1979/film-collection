import test from 'node:test';
import assert from 'node:assert/strict';
import { updateMovie } from '../../apps/api/server/controllers/movieController.js';
import { ingestMovieSchema, isSafeHttpUrl, isSafeHttpsUrl } from '../../apps/api/server/schemas/movie.js';
import { readBoundedJson } from '../../apps/api/server/services/metadata.js';

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
    'http://[::1]:8080/',
    'http://[::ffff:127.0.0.1]/',
    'https://user:pass@example.com/poster.jpg',
    'javascript:alert(1)',
  ]) {
    assert.equal(isSafeHttpUrl(unsafeUrl), false, `Expected isSafeHttpUrl to reject ${unsafeUrl}`);
    assert.equal(isSafeHttpsUrl(unsafeUrl), false, `Expected isSafeHttpsUrl to reject ${unsafeUrl}`);
  }

  const parsed = ingestMovieSchema.safeParse({
    title: 'Test Movie',
    posterPath: 'http://169.254.169.254/latest/meta-data/',
  });
  assert.equal(parsed.success, false);
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
