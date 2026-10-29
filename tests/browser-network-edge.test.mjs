// Run with the same preload used by browser-runtime's dev/preview children:
// node --test tests/browser-network-edge.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {build} from 'esbuild';
import './browser-network-edge.mjs';
const {Miniflare, convertV4MiniflareOptions} = await import('miniflare');
import {ofacCsv, ofacDate, ofacUrl} from './ofac-fixture.mjs';

test('Browser transport screens real supplier inputs against dated CSL bytes before and after runtime updates', async t => {
    const upstream = createServer((request, response) => response.end('Other outbound transport is real'));
    await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => upstream.close(resolve)));
    const bundle = await build({stdin: {contents: `
        import {screenSupplier} from './src/purse/screening.ts';
        export default {async fetch(request) {
            const url = new URL(request.url);
            if (url.pathname === '/transport') return fetch(url.searchParams.get('url'));
            return Response.json(await screenSupplier(url.searchParams.get('name'), url.searchParams.get('address') || ''));
        }};
    `, resolveDir: process.cwd()}, bundle: true, write: false, format: 'esm', platform: 'neutral'});
    const options = convertV4MiniflareOptions({modules: true, script: bundle.outputFiles[0].text,
        compatibilityDate: '2026-09-08', compatibilityFlags: ['nodejs_compat'],
        bindings: {AUTH_ORIGIN: 'http://localhost'}});
    const mf = new Miniflare(options);
    t.after(() => mf.dispose());
    for (const update of [false, true]) {
        if (update) await mf.setOptions(options);
        const screen = async name => {
            const response = await mf.dispatchFetch('http://localhost/?' + new URLSearchParams({name}));
            assert.equal(response.status, 200, response.status === 200 ? '' : await response.text());
            return response.json();
        };
        const safe = await screen('Fixture office supplier');
        assert.equal(safe.status, 'clear');
        assert.equal(safe.sources[0].url, ofacUrl);
        assert.equal(safe.sources[0].sourceDate, ofacDate);
        assert.equal(safe.sources[0].sha256, createHash('sha256').update(ofacCsv).digest('hex'));
        assert.equal((await screen('Blocked Alias Test')).matches[0].id, '901');
        assert.equal((await screen('AEROCARIBBEAN AIRLINES')).matches[0].id, '36');
        const forwarded = await mf.dispatchFetch('http://localhost/transport?' + new URLSearchParams({url: `http://127.0.0.1:${upstream.address().port}/`}));
        assert.equal(await forwarded.text(), 'Other outbound transport is real');
        const wrongUrl = await mf.dispatchFetch('http://localhost/transport?' + new URLSearchParams({url: new URL('/unexpected', ofacUrl).href}));
        assert.equal(wrongUrl.status, 500, 'An unexpected screening URL fails instead of contacting a live source');
    }
});
