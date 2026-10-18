// The run site (run-purse.com) as a visitor meets it: `rer build --site`, served the way static assets answer
// (/x is x.html), then the homepage's Run Purse opens /run with the commands, every docs page from docs/site.json
// answers with its title, and every same-origin link on every page resolves.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFile, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'

execFileSync('pnpm', ['exec', 'rer', 'build', '--site'], { stdio: 'inherit' })
const root = 'dist/site'
const file = async path => { try { return (await stat(path)).isFile() ? path : null } catch { return null } }
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' }
const server = createServer(async (request, response) => {
  const path = normalize(decodeURIComponent(new URL(request.url, 'http://site').pathname)).replace(/^(\.\.[/\\])+/, '')
  const hit = await file(join(root, path)) ?? await file(join(root, path === '/' ? 'index.html' : path.replace(/\/$/, '') + '.html'))
  response.writeHead(hit ? 200 : 404, { 'content-type': types[extname(hit ?? '.html')] ?? 'application/octet-stream' })
  response.end(hit ? await readFile(hit) : '')
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${server.address().port}`
const get = async path => { const response = await fetch(origin + path); return { status: response.status, text: await response.text() } }
try {
  const home = await get('/')
  assert.equal(home.status, 200)
  assert.match(home.text, /<a class="btn" href="\/run">Run Purse/, 'The homepage’s main action is Run Purse, to /run')
  assert.match(home.text, /100% free, open source alternative to/, 'The free line sits in the hero')
  assert.doesNotMatch(home.text, /href="\/(signin|login|setup|app)\b/, 'The run site links no instance-only route')

  const run = await get('/run')
  assert.equal(run.status, 200)
  const runText = run.text.replace(/<[^>]*>/g, '')
  assert.match(runText, /npx -y @runeditrun\/rer dev just-every\/run-purse/)
  assert.match(runText, /cd run-purse &amp;&amp; rer dev/)

  const manifest = JSON.parse(await readFile('docs/site.json', 'utf8'))
  const pages = manifest.sections.flatMap(section => section.pages)
  assert.ok(pages.length > 0)
  for (const page of pages) {
    const doc = await get(`/docs/${page.slug}`)
    assert.equal(doc.status, 200, `/docs/${page.slug}`)
    assert.ok(doc.text.includes(`<h1 id="docs-title" class="docs-title">${page.title.replace(/&/g, '&amp;')}</h1>`), `/docs/${page.slug} shows its title`)
  }

  const seen = new Set()
  for (const path of ['/', '/run', '/docs', ...pages.map(page => `/docs/${page.slug}`)]) {
    const { text } = await get(path)
    for (const [, href] of text.matchAll(/(?:href|src)="(\/[^"#]*)/g)) {
      if (seen.has(href)) continue
      seen.add(href)
      assert.equal((await fetch(origin + href)).status, 200, `${path} links ${href}`)
    }
  }
  console.log(`Run site: /, /run and ${pages.length} docs pages answer; ${seen.size} same-origin links resolve.`)
} finally {
  server.close()
}
