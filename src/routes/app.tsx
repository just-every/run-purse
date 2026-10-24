import {createFileRoute} from '@tanstack/react-router'
import {App} from '../ui/app'
// The purchasing workspace reads browser navigation and loads its authorized
// state on the client. Do not invoke its window-dependent renderer during SSR.
export const Route=createFileRoute('/app')({ssr:false,component:App})
