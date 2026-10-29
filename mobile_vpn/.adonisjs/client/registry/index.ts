/* eslint-disable prettier/prettier */
import type { AdonisEndpoint } from '@tuyau/core/types'
import type { Registry } from './schema.d.ts'
import type { ApiDefinition } from './tree.d.ts'

const placeholder: any = {}

const routes = {
  'health.show': {
    methods: ["GET","HEAD"],
    pattern: '/health',
    tokens: [{"old":"/health","type":0,"val":"health","end":""}],
    types: placeholder as Registry['health.show']['types'],
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
  'users.store': {
    methods: ["POST"],
    pattern: '/api/v1/users',
    tokens: [{"old":"/api/v1/users","type":0,"val":"api","end":""},{"old":"/api/v1/users","type":0,"val":"v1","end":""},{"old":"/api/v1/users","type":0,"val":"users","end":""}],
    types: placeholder as Registry['users.store']['types'],
  },
  'gateway_ssh_host_keys.rotate': {
    methods: ["POST"],
    pattern: '/api/v1/gateways/:id/ssh-host-key/rotate',
    tokens: [{"old":"/api/v1/gateways/:id/ssh-host-key/rotate","type":0,"val":"api","end":""},{"old":"/api/v1/gateways/:id/ssh-host-key/rotate","type":0,"val":"v1","end":""},{"old":"/api/v1/gateways/:id/ssh-host-key/rotate","type":0,"val":"gateways","end":""},{"old":"/api/v1/gateways/:id/ssh-host-key/rotate","type":1,"val":"id","end":""},{"old":"/api/v1/gateways/:id/ssh-host-key/rotate","type":0,"val":"ssh-host-key","end":""},{"old":"/api/v1/gateways/:id/ssh-host-key/rotate","type":0,"val":"rotate","end":""}],
    types: placeholder as Registry['gateway_ssh_host_keys.rotate']['types'],
  },
  'gateway_ssh_host_keys.index': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/gateways/:id/ssh-host-key/rotations',
    tokens: [{"old":"/api/v1/gateways/:id/ssh-host-key/rotations","type":0,"val":"api","end":""},{"old":"/api/v1/gateways/:id/ssh-host-key/rotations","type":0,"val":"v1","end":""},{"old":"/api/v1/gateways/:id/ssh-host-key/rotations","type":0,"val":"gateways","end":""},{"old":"/api/v1/gateways/:id/ssh-host-key/rotations","type":1,"val":"id","end":""},{"old":"/api/v1/gateways/:id/ssh-host-key/rotations","type":0,"val":"ssh-host-key","end":""},{"old":"/api/v1/gateways/:id/ssh-host-key/rotations","type":0,"val":"rotations","end":""}],
    types: placeholder as Registry['gateway_ssh_host_keys.index']['types'],
  },
  'gateway_security_alerts.index': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/gateways/:id/security-alerts',
    tokens: [{"old":"/api/v1/gateways/:id/security-alerts","type":0,"val":"api","end":""},{"old":"/api/v1/gateways/:id/security-alerts","type":0,"val":"v1","end":""},{"old":"/api/v1/gateways/:id/security-alerts","type":0,"val":"gateways","end":""},{"old":"/api/v1/gateways/:id/security-alerts","type":1,"val":"id","end":""},{"old":"/api/v1/gateways/:id/security-alerts","type":0,"val":"security-alerts","end":""}],
    types: placeholder as Registry['gateway_security_alerts.index']['types'],
  },
  'gateway_security_alerts.acknowledge': {
    methods: ["POST"],
    pattern: '/api/v1/gateways/:id/security-alerts/:alertId/acknowledge',
    tokens: [{"old":"/api/v1/gateways/:id/security-alerts/:alertId/acknowledge","type":0,"val":"api","end":""},{"old":"/api/v1/gateways/:id/security-alerts/:alertId/acknowledge","type":0,"val":"v1","end":""},{"old":"/api/v1/gateways/:id/security-alerts/:alertId/acknowledge","type":0,"val":"gateways","end":""},{"old":"/api/v1/gateways/:id/security-alerts/:alertId/acknowledge","type":1,"val":"id","end":""},{"old":"/api/v1/gateways/:id/security-alerts/:alertId/acknowledge","type":0,"val":"security-alerts","end":""},{"old":"/api/v1/gateways/:id/security-alerts/:alertId/acknowledge","type":1,"val":"alertId","end":""},{"old":"/api/v1/gateways/:id/security-alerts/:alertId/acknowledge","type":0,"val":"acknowledge","end":""}],
    types: placeholder as Registry['gateway_security_alerts.acknowledge']['types'],
  },
  'gateway_ethernets.hostname': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/gateways/:id/ethernet/hostname',
    tokens: [{"old":"/api/v1/gateways/:id/ethernet/hostname","type":0,"val":"api","end":""},{"old":"/api/v1/gateways/:id/ethernet/hostname","type":0,"val":"v1","end":""},{"old":"/api/v1/gateways/:id/ethernet/hostname","type":0,"val":"gateways","end":""},{"old":"/api/v1/gateways/:id/ethernet/hostname","type":1,"val":"id","end":""},{"old":"/api/v1/gateways/:id/ethernet/hostname","type":0,"val":"ethernet","end":""},{"old":"/api/v1/gateways/:id/ethernet/hostname","type":0,"val":"hostname","end":""}],
    types: placeholder as Registry['gateway_ethernets.hostname']['types'],
  },
  'gateways.vpn_profile': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/gateways/:id/vpn-profile',
    tokens: [{"old":"/api/v1/gateways/:id/vpn-profile","type":0,"val":"api","end":""},{"old":"/api/v1/gateways/:id/vpn-profile","type":0,"val":"v1","end":""},{"old":"/api/v1/gateways/:id/vpn-profile","type":0,"val":"gateways","end":""},{"old":"/api/v1/gateways/:id/vpn-profile","type":1,"val":"id","end":""},{"old":"/api/v1/gateways/:id/vpn-profile","type":0,"val":"vpn-profile","end":""}],
    types: placeholder as Registry['gateways.vpn_profile']['types'],
  },
  'gateways.network_operations': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/gateways/:id/network-operations',
    tokens: [{"old":"/api/v1/gateways/:id/network-operations","type":0,"val":"api","end":""},{"old":"/api/v1/gateways/:id/network-operations","type":0,"val":"v1","end":""},{"old":"/api/v1/gateways/:id/network-operations","type":0,"val":"gateways","end":""},{"old":"/api/v1/gateways/:id/network-operations","type":1,"val":"id","end":""},{"old":"/api/v1/gateways/:id/network-operations","type":0,"val":"network-operations","end":""}],
    types: placeholder as Registry['gateways.network_operations']['types'],
  },
  'gateway_ethernets.device': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/gateways/:id/ethernet/device',
    tokens: [{"old":"/api/v1/gateways/:id/ethernet/device","type":0,"val":"api","end":""},{"old":"/api/v1/gateways/:id/ethernet/device","type":0,"val":"v1","end":""},{"old":"/api/v1/gateways/:id/ethernet/device","type":0,"val":"gateways","end":""},{"old":"/api/v1/gateways/:id/ethernet/device","type":1,"val":"id","end":""},{"old":"/api/v1/gateways/:id/ethernet/device","type":0,"val":"ethernet","end":""},{"old":"/api/v1/gateways/:id/ethernet/device","type":0,"val":"device","end":""}],
    types: placeholder as Registry['gateway_ethernets.device']['types'],
  },
  'gateway_ethernets.apply': {
    methods: ["POST"],
    pattern: '/api/v1/gateways/:id/ethernet/apply',
    tokens: [{"old":"/api/v1/gateways/:id/ethernet/apply","type":0,"val":"api","end":""},{"old":"/api/v1/gateways/:id/ethernet/apply","type":0,"val":"v1","end":""},{"old":"/api/v1/gateways/:id/ethernet/apply","type":0,"val":"gateways","end":""},{"old":"/api/v1/gateways/:id/ethernet/apply","type":1,"val":"id","end":""},{"old":"/api/v1/gateways/:id/ethernet/apply","type":0,"val":"ethernet","end":""},{"old":"/api/v1/gateways/:id/ethernet/apply","type":0,"val":"apply","end":""}],
    types: placeholder as Registry['gateway_ethernets.apply']['types'],
  },
  'gateways.ethernet.index': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/gateways/:gateway_id/ethernet',
    tokens: [{"old":"/api/v1/gateways/:gateway_id/ethernet","type":0,"val":"api","end":""},{"old":"/api/v1/gateways/:gateway_id/ethernet","type":0,"val":"v1","end":""},{"old":"/api/v1/gateways/:gateway_id/ethernet","type":0,"val":"gateways","end":""},{"old":"/api/v1/gateways/:gateway_id/ethernet","type":1,"val":"gateway_id","end":""},{"old":"/api/v1/gateways/:gateway_id/ethernet","type":0,"val":"ethernet","end":""}],
    types: placeholder as Registry['gateways.ethernet.index']['types'],
  },
  'gateways.ethernet.store': {
    methods: ["POST"],
    pattern: '/api/v1/gateways/:gateway_id/ethernet',
    tokens: [{"old":"/api/v1/gateways/:gateway_id/ethernet","type":0,"val":"api","end":""},{"old":"/api/v1/gateways/:gateway_id/ethernet","type":0,"val":"v1","end":""},{"old":"/api/v1/gateways/:gateway_id/ethernet","type":0,"val":"gateways","end":""},{"old":"/api/v1/gateways/:gateway_id/ethernet","type":1,"val":"gateway_id","end":""},{"old":"/api/v1/gateways/:gateway_id/ethernet","type":0,"val":"ethernet","end":""}],
    types: placeholder as Registry['gateways.ethernet.store']['types'],
  },
  'gateways.ethernet.show': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/gateways/:gateway_id/ethernet/:id',
    tokens: [{"old":"/api/v1/gateways/:gateway_id/ethernet/:id","type":0,"val":"api","end":""},{"old":"/api/v1/gateways/:gateway_id/ethernet/:id","type":0,"val":"v1","end":""},{"old":"/api/v1/gateways/:gateway_id/ethernet/:id","type":0,"val":"gateways","end":""},{"old":"/api/v1/gateways/:gateway_id/ethernet/:id","type":1,"val":"gateway_id","end":""},{"old":"/api/v1/gateways/:gateway_id/ethernet/:id","type":0,"val":"ethernet","end":""},{"old":"/api/v1/gateways/:gateway_id/ethernet/:id","type":1,"val":"id","end":""}],
    types: placeholder as Registry['gateways.ethernet.show']['types'],
  },
  'gateways.ethernet.update': {
    methods: ["PUT","PATCH"],
    pattern: '/api/v1/gateways/:gateway_id/ethernet/:id',
    tokens: [{"old":"/api/v1/gateways/:gateway_id/ethernet/:id","type":0,"val":"api","end":""},{"old":"/api/v1/gateways/:gateway_id/ethernet/:id","type":0,"val":"v1","end":""},{"old":"/api/v1/gateways/:gateway_id/ethernet/:id","type":0,"val":"gateways","end":""},{"old":"/api/v1/gateways/:gateway_id/ethernet/:id","type":1,"val":"gateway_id","end":""},{"old":"/api/v1/gateways/:gateway_id/ethernet/:id","type":0,"val":"ethernet","end":""},{"old":"/api/v1/gateways/:gateway_id/ethernet/:id","type":1,"val":"id","end":""}],
    types: placeholder as Registry['gateways.ethernet.update']['types'],
  },
  'queue_healths.show': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/health/queue',
    tokens: [{"old":"/api/v1/health/queue","type":0,"val":"api","end":""},{"old":"/api/v1/health/queue","type":0,"val":"v1","end":""},{"old":"/api/v1/health/queue","type":0,"val":"health","end":""},{"old":"/api/v1/health/queue","type":0,"val":"queue","end":""}],
    types: placeholder as Registry['queue_healths.show']['types'],
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
