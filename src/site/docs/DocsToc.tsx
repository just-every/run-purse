import type { DocsTocEntry } from './types'

type Group = DocsTocEntry & { children: DocsTocEntry[] }

/** h3s nest under the h2 before them. A page with fewer than two h2s gets no contents list. */
function groups(toc: DocsTocEntry[]) {
  if (toc.filter(entry => entry.depth === 2).length < 2) return []
  return toc.reduce<Group[]>((list, entry) => {
    if (entry.depth === 3 && list.length) list[list.length - 1].children.push(entry)
    else list.push({ ...entry, children: [] })
    return list
  }, [])
}

/** "On this page": beside the article on wide screens, above it on narrow ones. */
export function DocsToc({ toc }: { toc: DocsTocEntry[] }) {
  const list = groups(toc)
  if (!list.length) return null
  return (
    <nav className="docs-toc" aria-labelledby="docs-toc-title">
      <p className="docs-toc-title" id="docs-toc-title">On this page</p>
      <ul>
        {list.map(group => (
          <li key={group.id}>
            <a href={`#${group.id}`}>{group.text}</a>
            {group.children.length > 0 && <ul>{group.children.map(entry => <li key={entry.id}><a href={`#${entry.id}`}>{entry.text}</a></li>)}</ul>}
          </li>
        ))}
      </ul>
    </nav>
  )
}
