import {builtinModules} from 'node:module'

/** Keep CommonJS libraries on actual Worker Node APIs through static imports. */
export const workerNodeBuiltins={name:'worker-node-builtins',setup(build){
 const builtins=new Set(builtinModules.map(name=>name.replace(/^node:/,'')))
 build.onResolve({filter:/^[a-z][a-z_]*(?:\/[a-z_]+)?$/},args=>builtins.has(args.path)?{path:args.path,namespace:'worker-node-builtin'}:undefined)
 build.onLoad({filter:/.*/,namespace:'worker-node-builtin'},args=>({contents:`import builtin from ${JSON.stringify('node:'+args.path)}; module.exports = builtin;`,loader:'js'}))
}}
