import type { ReactNode } from 'react'
import { SiteFooter } from '../shell/SiteFooter'
import { SiteHeader } from '../shell/SiteHeader'
import { DocsSidebar } from './DocsNav'
import './docs.css'

/** Every docs page: the site header, the section sidebar, the page, the footer. */
export function DocsFrame({ current, children, aside }: { current?: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <>
      <SiteHeader current="docs" />
      <div className={aside ? 'docs-shell docs-shell-toc' : 'docs-shell'}>
        <DocsSidebar current={current} />
        <main id="main" className="docs-main">{children}</main>
        {aside}
      </div>
      <SiteFooter />
    </>
  )
}
