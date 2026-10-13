import { DocsFrame } from './DocsFrame'
import { DocsMenu } from './DocsNav'
import { DocsPager } from './DocsPager'
import { DocsToc } from './DocsToc'
import { docsNeighbours, getDocsPage } from './pages'

/** One docs page: the article rendered from Markdown at build time, "On this page", and previous and next cards. */
export function DocsArticle({ slug }: { slug: string }) {
  const page = getDocsPage(slug)
  if (!page) throw new Error(`docs/site.json has no page "${slug}"`)
  const { previous, next } = docsNeighbours(slug)
  return (
    <DocsFrame current={slug} aside={<DocsToc toc={page.toc} />}>
      <DocsMenu current={slug} label={page.title} />
      <article className="docs-article" aria-labelledby="docs-title">
        <header className="docs-page-head">
          <p className="docs-eyebrow">{page.section}</p>
          <h1 id="docs-title" className="docs-title">{page.title}</h1>
          <p className="docs-lead">{page.summary}</p>
        </header>
        <div className="docs-prose" dangerouslySetInnerHTML={{ __html: page.html }} />
      </article>
      <DocsPager previous={previous} next={next} />
    </DocsFrame>
  )
}
