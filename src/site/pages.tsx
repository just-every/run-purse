import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { runPageHtml, siteNotFoundHtml, type SiteBuild, type SiteContext } from '../base/run-site'
import { identity } from '../identity'
import { DocsArticle } from './docs/DocsArticle'
import { DocsIndex } from './docs/DocsIndex'
import { docsHead, docsPages } from './docs/pages'
import { Landing } from './landing/Landing'
import { run } from './run'
import './shell/site.css'

/**
 * The run site (run-purse.com), written by `rer build --site`: the landing at `/`, whose Run Purse opens the Run page
 * at `/run`; the docs at `/docs` and `/docs/<slug>`, rendered from docs/site.json and docs/*.md; and the not-found
 * page. Every page is static, needs no script and links no instance-only route. The installed app's `/` is the Lobby.
 */
export function sitePages({ styles }: SiteContext): SiteBuild {
  const document = ({ title, description }: { title: string; description: string }, body: ReactElement) => '<!doctype html>' + renderToStaticMarkup(
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta name="theme-color" content="#f7f5f0" />
        <link rel="icon" type="image/svg+xml" href={identity.mark} />
        <link rel="preload" href="/fonts/outfit/outfit-latin-wght-normal.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="stylesheet" href={identity.theme} />
        {styles.map(href => <link key={href} rel="stylesheet" href={href} />)}
      </head>
      <body className="site">{body}</body>
    </html>,
  )
  return {
    pages: [
      { path: '/', html: document({ title: 'Purse — Every purchase, accounted for', description: identity.tagline }, <Landing />) },
      { path: '/run', html: runPageHtml(identity, run) },
      { path: '/docs', html: document(docsHead(), <DocsIndex />) },
      ...docsPages.map(page => ({ path: `/docs/${page.slug}`, html: document(docsHead(page.slug), <DocsArticle slug={page.slug} />) })),
      { path: '/404', html: siteNotFoundHtml(identity, run) },
    ],
    assets: ['rer-theme.css', 'fonts', 'brand'],
  }
}
