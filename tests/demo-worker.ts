// The test Worker behind Base's demo wrapper, as src/server.ts wraps the deployed one.
import { withDemo } from '../src/modules/demo/index.mjs'
import worker from './purse-worker'
import { seedDemo } from '../src/demo'
export default withDemo(worker, { seed: seedDemo })
