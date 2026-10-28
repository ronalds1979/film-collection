import test from 'node:test';
import assert from 'node:assert/strict';
import { updateMovie } from '../../server/controllers/movieController.js';

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
