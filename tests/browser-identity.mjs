import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';
import { nativeWebContext } from './native-web-fixture.mjs';
import { identityFixture } from './identity-fixture.mjs';

const { chromium } = await import(process.env.PURSE_PLAYWRIGHT_MODULE || '@playwright/test');
const widthArgument = process.argv.find(argument => argument.startsWith('--width='));
const widths = widthArgument ? [Number(widthArgument.slice(8))] : [1440, 390];
assert.ok(widths.every(width => [1440, 390].includes(width)));
const evidence = resolve(process.env.PURSE_EVIDENCE || '.cache/identity');
await mkdir(evidence, { recursive: true });
const shippedApp = (await build({
    stdin: { contents: "import React from 'react';import{createRoot}from'react-dom/client';import{App}from'./src/ui/app';createRoot(document.getElementById('root')).render(<App/>);", resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'esm', platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' },
})).outputFiles[0].text;
const browser = await chromium.launch({
    headless: true,
    ...(process.env.PURSE_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PURSE_CHROMIUM_EXECUTABLE_PATH } : {}),
    args: ['--use-mock-keychain', '--password-store=basic'],
});
try {
    for (const width of widths) {
        const h = await identityFixture(), contexts = [];
        const pageErrors = [];
        try {
            await h.command('business', { name: 'Canyon native SSO', currencies: ['USD'], locations: ['Denver', 'Boulder'], costCentres: ['Operations', 'IT'], projects: ['Safety'] });
            const scope = { departments: ['Operations'], locations: ['Denver'], projects: ['Safety'], entities: ['main'] };
            await h.command('member', { email: 'requester@example.test', name: 'SSO field requester', grants: [{ role: 'requester', scope }] });
            await h.send('/api/purse/invite', { email: 'requester@example.test' }, h.owner);
            async function open(anonymous = false) {
                const context = await nativeWebContext(browser, h, width, shippedApp);
                contexts.push(context);
                if (anonymous) await context.clearCookies();
                await context.setExtraHTTPHeaders({ 'CF-Connecting-IP': '127.0.0.1' });
                const page = await context.newPage();
                page.on('pageerror', error => { pageErrors.push(error.message); });
                return { context, page };
            }
            async function snap(page, name) {
                const body = await page.locator('body').innerText();
                for (const secret of [h.idp.privateKey.d, h.transactionSecret, h.sessionSecret]) assert.ok(!body.includes(secret), 'A captured page never reads back an installation credential');
                await page.evaluate(() => document.fonts.ready);
                assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, name + ' fits the viewport');
                await page.screenshot({ path: join(evidence, `ACCESS-002-${name}-${width}.png`), fullPage: true });
            }
            const owner = await open(), requester = await open(true);
            const settingsPath = h.origin + '/auth/purse/identity';
            await owner.page.goto(settingsPath);
            await owner.page.getByRole('heading', { name: 'Single sign-on', exact: true }).waitFor();
            await owner.page.getByRole('button', { name: 'Enable provider sign-in', exact: true }).waitFor();
            await snap(owner.page, 'owner-disabled');
            await requester.page.goto(h.origin + '/signin?returnTo=%2Fapp');
            await requester.page.getByRole('heading', { name: /Sign in to/ }).waitFor();
            assert.equal(await requester.page.getByRole('button', { name: 'Continue with Local test company', exact: true }).count(), 0);
            await Promise.all([
                owner.page.waitForResponse(response => response.url() === settingsPath && response.request().method() === 'POST').then(response => assert.equal(response.status(), 303)),
                owner.page.getByRole('button', { name: 'Enable provider sign-in', exact: true }).click(),
            ]);
            await owner.page.getByRole('button', { name: 'Disable provider sign-in', exact: true }).waitFor();
            await snap(owner.page, 'owner-enabled');
            async function signIn() {
                await requester.page.goto(h.origin + '/signin?returnTo=%2Fapp');
                const button = requester.page.getByRole('button', { name: 'Continue with Local test company', exact: true });
                await button.waitFor();
                await snap(requester.page, 'provider-sign-in');
                await Promise.all([
                    requester.page.waitForResponse(response => new URL(response.url()).origin === h.idp.origin && new URL(response.url()).pathname === '/authorize').then(response => assert.equal(response.status(), 303)),
                    requester.page.waitForResponse(response => new URL(response.url()).pathname === '/auth/oidc/company/callback').then(response => assert.equal(response.status(), 303)),
                    requester.page.waitForURL(h.origin + '/app'),
                    button.click(),
                ]);
                const workspace = await requester.context.request.get(h.origin + '/api/purse/state');
                assert.equal(workspace.status(), 200, await workspace.text());
                // Redirect chains bypass Playwright's static asset route. The real
                // callback and native session above complete before opening the shipped App.
                await requester.page.goto(h.origin + '/app');
                await requester.page.getByRole('region', { name: 'Requests', exact: true }).waitFor();
                await requester.page.getByLabel('Ask Purse for something to buy', { exact: true }).waitFor();
                const identity = await requester.context.request.get(h.origin + '/auth/session');
                assert.equal(identity.status(), 200);
                const session = await identity.json();
                assert.equal(session.kind, 'oidc'); assert.equal(session.operator.role, 'member');
                const response = await requester.context.request.get(h.origin + '/api/purse/state');
                assert.equal(response.status(), 200);
                const state = await response.json();
                assert.deepEqual(state.actor.roles, ['requester']); assert.deepEqual(state.actor.grants[0].scope, scope);
                assert.ok(!state.actor.permissions.includes('access.manage')); assert.deepEqual(state.data.member, []);
                assert.equal(await requester.page.getByRole('navigation').getByRole('button', { name: 'Settings', exact: true }).count(), 0);
                assert.equal((await requester.context.request.get(settingsPath)).status(), 403);
                const forged = await requester.context.request.post(h.origin + '/api/purse/command/member', { headers: { origin: h.origin }, data: { email: 'forged-owner@example.test', name: 'Forbidden provider claim', roles: ['owner'] } });
                assert.equal(forged.status(), 403);
                await snap(requester.page, 'native-requester-workspace');
            }
            async function refusedWorkspace(name) {
                assert.equal((await requester.context.request.get(h.origin + '/auth/session')).status(), 401);
                assert.equal((await requester.context.request.get(h.origin + '/api/purse/state')).status(), 401);
                await requester.page.goto(h.origin + '/app');
                await requester.page.getByRole('alert').getByRole('link', { name: 'Sign in', exact: true }).waitFor();
                assert.equal(await requester.page.getByRole('region', { name: 'Requests', exact: true }).count(), 0);
                await snap(requester.page, name);
            }
            await signIn();
            assert.equal((await requester.context.request.post(h.origin + '/auth/signout', { headers: { origin: h.origin }, data: {} })).status(), 204);
            await refusedWorkspace('signed-out');
            await signIn();
            await owner.page.reload();
            await Promise.all([
                owner.page.waitForResponse(response => response.url() === settingsPath && response.request().method() === 'POST').then(response => assert.equal(response.status(), 303)),
                owner.page.getByRole('button', { name: 'Disable provider sign-in', exact: true }).click(),
            ]);
            await owner.page.getByRole('button', { name: 'Enable provider sign-in', exact: true }).waitFor();
            await snap(owner.page, 'owner-disabled-sessions-ended');
            await refusedWorkspace('provider-session-ended');
            await requester.page.goto(h.origin + '/signin?returnTo=%2Fapp');
            await requester.page.getByRole('heading', { name: /Sign in to/ }).waitFor();
            assert.equal(await requester.page.getByRole('button', { name: 'Continue with Local test company', exact: true }).count(), 0);
            assert.equal((await owner.context.request.get(h.origin + '/auth/session')).status(), 200, 'Native owner recovery sign-in remains current');
            assert.deepEqual(pageErrors, [], 'Native settings and the shipped App have no browser exceptions');
        } catch (error) {
            console.error('Identity browser exceptions:', JSON.stringify(pageErrors));
            console.error(error);
            for (const [index, context] of contexts.entries()) for (const page of context.pages()) {
                await page.screenshot({ path: join(evidence, `ACCESS-002-failure-${index}-${width}.png`), fullPage: true }).catch(() => {});
                console.error('Identity browser state:', new URL(page.url()).pathname, (await page.locator('body').innerText()).slice(0, 1200));
            }
            throw error;
        } finally {
            try { await Promise.all(contexts.map(context => context.close())); } finally { await h.close(); }
        }
    }
} finally { await browser.close(); }
console.log('Native OIDC owner and requester web journeys passed at ' + widths.join('/'));
