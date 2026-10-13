import type { RunData } from '../base/run-site'
import { repository } from './shell/repository'

/** Every string and command the run site's Run page (run-purse.com/run) shows. */
export const run: RunData = {
  name: 'Purse',
  repository,
  clone: `git clone ${repository}.git purse`,
  folder: 'purse',
  requirements: 'Needs Node 22 or later and pnpm 10.12.4, on macOS, Linux or Windows with WSL2.',
  licence: 'MIT',
  docs: true,
  hosted: [],
}
