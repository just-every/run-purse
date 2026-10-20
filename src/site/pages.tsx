import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { contractPageHtml } from '../base/contract-page'
import { runPageHtml, siteNotFoundHtml, type SiteBuild, type SiteContext } from '../base/run-site'
import { identity } from '../identity'
import { DocsArticle } from './docs/DocsArticle'
import { DocsIndex } from './docs/DocsIndex'
import { docsHead, docsPages } from './docs/pages'
import { keepTogether } from './landing/keep-together'
import { Landing } from './landing/Landing'
import { run } from './run'
import './shell/site.css'

/**
 * The run site (run-purse.com), written by `rer build --site`: the landing at `/`, whose Run Purse opens the Run page
 * at `/run`; the docs at `/docs` and `/docs/<slug>`, rendered from docs/site.json and docs/*.md; /contract from CONTRACT.md; and the not-found
 * page. Every page is static and links no instance-only route; the homepage's one inline script only hides a "·" that a
 * line break leaves at a line's end. The installed app's `/` is the Lobby.
 */
export function sitePages({ styles, contract }: SiteContext): SiteBuild {
  const document = ({ title, description }: { title: string; description: string }, body: ReactElement) => '<!doctype html>' + renderToStaticMarkup(
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta name="theme-color" content="#ffffff" />
        <link rel="icon" href="/brand/favicon.ico" sizes="32x32" />
        <link rel="icon" type="image/svg+xml" href="/brand/favicon.svg" />
        <link rel="apple-touch-icon" href="/brand/apple-touch-icon.png" />
        <link rel="preload" href="/fonts/figtree/figtree-latin-wght-normal.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/bitter/bitter-latin-wght-normal.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="stylesheet" href={identity.theme} />
        {styles.map(href => <link key={href} rel="stylesheet" href={href} />)}
      </head>
      <body className="site">{body}</body>
    </html>,
  )
  return {
    pages: [
      { path: '/', html: keepTogether(document({ title: 'Purse — Every team’s purchases, request to payment', description: 'Purse takes every team’s requests, holds them to budget, sends and chases each PO, and matches every invoice to its order and delivery before syncing it to your books. 100% free, open source alternative to Procurify, Coupa and Precoro.' }, <Landing />)) },
      { path: '/run', html: runPageHtml(identity, run, contract) },
      ...(contract ? [{ path: '/contract', html: contractPageHtml(identity, run, contract) }] : []),
      { path: '/docs', html: document(docsHead(), <DocsIndex />) },
      ...docsPages.map(page => ({ path: `/docs/${page.slug}`, html: document(docsHead(page.slug), <DocsArticle slug={page.slug} />) })),
      { path: '/404', html: siteNotFoundHtml(identity, run, contract) },
    ],
    assets: ['rer-theme.css', 'fonts', 'brand', 'site'],
  }
}
