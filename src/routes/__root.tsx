import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router'
import { fontLinks } from '../base/font-head'
import { introCss, introGuardScript } from '../base/hydration/intro-guard'
import { HydrationUnit } from '../base/hydration/unit'

export const Route = createRootRoute({
  head: () => ({ meta: [{ charSet: 'utf-8' }, { name: 'viewport', content: 'width=device-width, initial-scale=1' }], title: 'Purse' }),
  notFoundComponent: () => <HydrationUnit><h1>Not found</h1></HydrationUnit>,
  component: () => <html lang="en"><head>
    {fontLinks.map(link => <link key={link.href} {...link} />)}
    <link rel="stylesheet" href="/rer-theme.css" />
    <link rel="stylesheet" href="/purse.css" />
    <link rel="icon" type="image/svg+xml" href="/brand/mark.svg" />
    <HeadContent />
    <script dangerouslySetInnerHTML={{ __html: introGuardScript }} />
    <style>{introCss}</style>

  </head><body><Outlet /><Scripts /></body></html>,
})
