import type { EditionIdentity } from './base/identity'
import branding from './branding.json'

export const identity: EditionIdentity = {
  product: 'Purse',
  deployment: branding.name,
  purpose: '{deployment} keeps track of what you approved, ordered and still need to receive.',
  tagline: 'Follow every purchase from request to invoice. 100% free, open source purchasing for one business. MIT licensed.',
  signInPath: '/signin',
  runSite: 'https://run-purse.com',
  installedHome: 'lobby',
  theme: '/rer-theme.css',
  mark: '/brand/mark.svg',
  band: '/brand/band.svg',
  fonts: '/fonts/fonts.css',
  accentColor: branding.primaryColor,
}
