import pkg from '../../../package.json'

// Source links come from package.json `repository`, so the run site never names another address.
export const repository: string = pkg.repository
export const licenceUrl = `${repository}/blob/main/LICENSE`
