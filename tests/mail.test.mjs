import test from 'node:test';
import assert from 'node:assert/strict';
import {operatorMail} from '../src/mail.server.mjs';

test('Hosted operator mail submits through the configured Managed relay', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push({url, init});
    return Response.json({messageId: '<synthetic-purse-1@example.test>'}, {status: 202});
  };
  try {
    const env = {MAIL_PROVIDER: 'rer', MAIL_RELAY_URL: 'https://relay.example.test/messages', MAIL_API_KEY: 'synthetic-purse-1'};
    const message = {deliveryId: 'synthetic-purse-1', from: 'purse@example.test', to: ['owner@example.test'], subject: 'Sign in to Purse', text: 'Open the sign-in link.'};
    const receipt = await operatorMail(env).send(message);
    assert.equal(receipt.status, 'accepted');
    assert.equal(receipt.provider, 'rer');
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, env.MAIL_RELAY_URL);
    assert.equal(requests[0].init.method, 'POST');
    assert.equal(requests[0].init.headers.Authorization, `Bearer ${env.MAIL_API_KEY}`);
    assert.deepEqual(JSON.parse(requests[0].init.body), {to: 'owner@example.test', subject: message.subject, text: message.text});
    assert.throws(() => operatorMail({...env, MAIL_RELAY_URL: undefined}).send(message), {code: 'rer_relay_url_required'});
    assert.equal(requests.length, 1, 'Missing relay configuration never sends a request');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Local operator mail stays suppressed with hosted relay defaults present', async () => {
  const receipt = await operatorMail({MAIL_PROVIDER: 'development', AUTH_LOCAL: 'true', MAIL_RELAY_URL: ''}).send({
    deliveryId: 'synthetic-purse-2', from: 'purse@example.test', to: ['owner@example.test'], subject: 'Local sign-in', text: 'Local message.',
  });
  assert.equal(receipt.provider, 'development');
  assert.equal(receipt.status, 'accepted');
});
