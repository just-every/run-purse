// A painted plate as AVIF with WebP for older browsers, at the widths plates.py wrote to public/site.
export function Plate({ name, widths, sizes, width, height, alt = '', className, eager = false }: { name: string; widths: number[]; sizes: string; width: number; height: number; alt?: string; className?: string; eager?: boolean }) {
  const set = (type: string) => widths.map(w => `/site/${name}-${w}.${type} ${w}w`).join(', ')
  return (
    <picture className={className}>
      <source type="image/avif" srcSet={set('avif')} sizes={sizes} />
      <img src={`/site/${name}-${widths[Math.min(2, widths.length - 1)]}.webp`} srcSet={set('webp')} sizes={sizes} width={width} height={height} alt={alt} loading={eager ? 'eager' : 'lazy'} decoding="async" fetchPriority={eager ? 'high' : undefined} />
    </picture>
  )
}
