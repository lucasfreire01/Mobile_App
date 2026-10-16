/* eslint-disable prettier/prettier */
import type { AdonisEndpoint } from '@tuyau/core/types'
import type { Registry } from './schema.d.ts'
import type { ApiDefinition } from './tree.d.ts'

const placeholder: any = {}

const routes = {
  'auth.new_account.store': {
    methods: ["POST"],
    pattern: '/api/v1/auth/signup',
    tokens: [{"old":"/api/v1/auth/signup","type":0,"val":"api","end":""},{"old":"/api/v1/auth/signup","type":0,"val":"v1","end":""},{"old":"/api/v1/auth/signup","type":0,"val":"auth","end":""},{"old":"/api/v1/auth/signup","type":0,"val":"signup","end":""}],
    types: placeholder as Registry['auth.new_account.store']['types'],
  },
  'auth.access_tokens.store': {
    methods: ["POST"],
    pattern: '/api/v1/auth/login',
    tokens: [{"old":"/api/v1/auth/login","type":0,"val":"api","end":""},{"old":"/api/v1/auth/login","type":0,"val":"v1","end":""},{"old":"/api/v1/auth/login","type":0,"val":"auth","end":""},{"old":"/api/v1/auth/login","type":0,"val":"login","end":""}],
    types: placeholder as Registry['auth.access_tokens.store']['types'],
  },
  'profile.profile.show': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/account/profile',
    tokens: [{"old":"/api/v1/account/profile","type":0,"val":"api","end":""},{"old":"/api/v1/account/profile","type":0,"val":"v1","end":""},{"old":"/api/v1/account/profile","type":0,"val":"account","end":""},{"old":"/api/v1/account/profile","type":0,"val":"profile","end":""}],
    types: placeholder as Registry['profile.profile.show']['types'],
  },
  'profile.access_tokens.destroy': {
    methods: ["POST"],
    pattern: '/api/v1/account/logout',
    tokens: [{"old":"/api/v1/account/logout","type":0,"val":"api","end":""},{"old":"/api/v1/account/logout","type":0,"val":"v1","end":""},{"old":"/api/v1/account/logout","type":0,"val":"account","end":""},{"old":"/api/v1/account/logout","type":0,"val":"logout","end":""}],
    types: placeholder as Registry['profile.access_tokens.destroy']['types'],
  },
  'gateways.index': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/gateways',
    tokens: [{"old":"/api/v1/gateways","type":0,"val":"api","end":""},{"old":"/api/v1/gateways","type":0,"val":"v1","end":""},{"old":"/api/v1/gateways","type":0,"val":"gateways","end":""}],
    types: placeholder as Registry['gateways.index']['types'],
  },
  'gateways.store': {
    methods: ["POST"],
    pattern: '/api/v1/gateways',
    tokens: [{"old":"/api/v1/gateways","type":0,"val":"api","end":""},{"old":"/api/v1/gateways","type":0,"val":"v1","end":""},{"old":"/api/v1/gateways","type":0,"val":"gateways","end":""}],
    types: placeholder as Registry['gateways.store']['types'],
  },
  'gateways.show': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/gateways/:id',
    tokens: [{"old":"/api/v1/gateways/:id","type":0,"val":"api","end":""},{"old":"/api/v1/gateways/:id","type":0,"val":"v1","end":""},{"old":"/api/v1/gateways/:id","type":0,"val":"gateways","end":""},{"old":"/api/v1/gateways/:id","type":1,"val":"id","end":""}],
    types: placeholder as Registry['gateways.show']['types'],
  },
  'gateways.update': {
    methods: ["PUT","PATCH"],
    pattern: '/api/v1/gateways/:id',
    tokens: [{"old":"/api/v1/gateways/:id","type":0,"val":"api","end":""},{"old":"/api/v1/gateways/:id","type":0,"val":"v1","end":""},{"old":"/api/v1/gateways/:id","type":0,"val":"gateways","end":""},{"old":"/api/v1/gateways/:id","type":1,"val":"id","end":""}],
    types: placeholder as Registry['gateways.update']['types'],
  },
  'gateways.destroy': {
    methods: ["DELETE"],
    pattern: '/api/v1/gateways/:id',
    tokens: [{"old":"/api/v1/gateways/:id","type":0,"val":"api","end":""},{"old":"/api/v1/gateways/:id","type":0,"val":"v1","end":""},{"old":"/api/v1/gateways/:id","type":0,"val":"gateways","end":""},{"old":"/api/v1/gateways/:id","type":1,"val":"id","end":""}],
    types: placeholder as Registry['gateways.destroy']['types'],
  },
  'gateway_ethernets.show': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/gateways/:id/ethernet',
    tokens: [{"old":"/api/v1/gateways/:id/ethernet","type":0,"val":"api","end":""},{"old":"/api/v1/gateways/:id/ethernet","type":0,"val":"v1","end":""},{"old":"/api/v1/gateways/:id/ethernet","type":0,"val":"gateways","end":""},{"old":"/api/v1/gateways/:id/ethernet","type":1,"val":"id","end":""},{"old":"/api/v1/gateways/:id/ethernet","type":0,"val":"ethernet","end":""}],
    types: placeholder as Registry['gateway_ethernets.show']['types'],
  },
  'gateway_ethernets.update': {
    methods: ["PUT"],
    pattern: '/api/v1/gateways/:id/ethernet',
    tokens: [{"old":"/api/v1/gateways/:id/ethernet","type":0,"val":"api","end":""},{"old":"/api/v1/gateways/:id/ethernet","type":0,"val":"v1","end":""},{"old":"/api/v1/gateways/:id/ethernet","type":0,"val":"gateways","end":""},{"old":"/api/v1/gateways/:id/ethernet","type":1,"val":"id","end":""},{"old":"/api/v1/gateways/:id/ethernet","type":0,"val":"ethernet","end":""}],
    types: placeholder as Registry['gateway_ethernets.update']['types'],
  },
  'gateway_ethernets.hostname': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/gateways/:id/ethernet/hostname',
    tokens: [{"old":"/api/v1/gateways/:id/ethernet/hostname","type":0,"val":"api","end":""},{"old":"/api/v1/gateways/:id/ethernet/hostname","type":0,"val":"v1","end":""},{"old":"/api/v1/gateways/:id/ethernet/hostname","type":0,"val":"gateways","end":""},{"old":"/api/v1/gateways/:id/ethernet/hostname","type":1,"val":"id","end":""},{"old":"/api/v1/gateways/:id/ethernet/hostname","type":0,"val":"ethernet","end":""},{"old":"/api/v1/gateways/:id/ethernet/hostname","type":0,"val":"hostname","end":""}],
    types: placeholder as Registry['gateway_ethernets.hostname']['types'],
  },
} as const satisfies Record<string, AdonisEndpoint>

export { routes }

export const registry = {
  routes,
  $tree: {} as ApiDefinition,
}

declare module '@tuyau/core/types' {
  export interface UserRegistry {
    routes: typeof routes
    $tree: ApiDefinition
  }
}
