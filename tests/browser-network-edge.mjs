// Node preload for the disposable browser installation's dev/preview process.
// Intercept only the Worker's outbound transport: application modules, native
// sessions, supplier commands, CSV parsing and screening decisions stay real.
import assert from 'node:assert/strict';
import {createRequire, registerHooks} from 'node:module';
import {pathToFileURL} from 'node:url';
import {ofacCsv, ofacDate, ofacUrl} from './ofac-fixture.mjs';

const require = createRequire(import.meta.url);
const path = require.resolve('miniflare');
function networkEdge(options) {
    return {...options, workers: options.workers.map(worker => {
        if (!worker.config.env?.AUTH_ORIGIN) return worker;
        const previous = worker.dev?.outboundService;
        return {...worker, dev: {...worker.dev, outboundService: {
            type: 'fetcher',
            async handler(request, miniflare) {
                if (new URL(request.url).origin === new URL(ofacUrl).origin) {
                    assert.equal(request.url, ofacUrl, 'Screening uses the authoritative CSL URL');
                    assert.equal(request.method, 'GET');
                    return new Response(ofacCsv, {headers: {'content-type': 'text/csv', 'last-modified': ofacDate}});
                }
                if (previous) {
                    assert.equal(previous.type, 'fetcher', 'Preserve the existing test network edge');
                    return previous.handler(request, miniflare);
                }
                return fetch(request.url, {method: request.method, headers: request.headers,
                    ...(!['GET', 'HEAD'].includes(request.method) ? {body: await request.arrayBuffer()} : {})});
            },
        }}};
    })};
}
// Install before Vite loads Miniflare. Only the Node-side runtime constructor
// and update options change; no Worker module or global fetch is replaced.
const factory = Symbol.for('purse.browser.ofac-network-edge');
globalThis[factory] = runtime => ({...runtime, Miniflare: class extends runtime.Miniflare {
    constructor(options) { super(networkEdge(options)); }
    setOptions(options) { return super.setOptions(networkEdge(options)); }
}});
registerHooks({load(url, context, nextLoad) {
    const loaded = nextLoad(url, context);
    if (url !== pathToFileURL(path).href) return loaded;
    return {...loaded, source: loaded.source +
        "\nmodule.exports = globalThis[Symbol.for('purse.browser.ofac-network-edge')](module.exports);\n"};
}});
