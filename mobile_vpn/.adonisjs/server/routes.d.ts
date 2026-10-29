import '@adonisjs/core/types/http'

type ParamValue = string | number | bigint | boolean

export type ScannedRoutes = {
  ALL: {
    'health.show': { paramsTuple?: []; params?: {} }
    'auth.access_tokens.store': { paramsTuple?: []; params?: {} }
    'profile.profile.show': { paramsTuple?: []; params?: {} }
    'profile.access_tokens.destroy': { paramsTuple?: []; params?: {} }
    'gateways.index': { paramsTuple?: []; params?: {} }
    'gateways.store': { paramsTuple?: []; params?: {} }
    'gateways.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'gateways.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'gateways.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'gateway_ssh_host_keys.rotate': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'gateway_ssh_host_keys.index': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'gateway_security_alerts.index': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'gateway_security_alerts.acknowledge': { paramsTuple: [ParamValue,ParamValue]; params: {'id': ParamValue,'alertId': ParamValue} }
    'gateway_ethernets.hostname': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'gateways.vpn_profile': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'gateways.network_operations': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'gateway_ethernets.device': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'gateway_ethernets.apply': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'gateways.ethernet.index': { paramsTuple: [ParamValue]; params: {'gateway_id': ParamValue} }
    'gateways.ethernet.store': { paramsTuple: [ParamValue]; params: {'gateway_id': ParamValue} }
    'gateways.ethernet.show': { paramsTuple: [ParamValue,ParamValue]; params: {'gateway_id': ParamValue,'id': ParamValue} }
    'gateways.ethernet.update': { paramsTuple: [ParamValue,ParamValue]; params: {'gateway_id': ParamValue,'id': ParamValue} }
    'queue_healths.show': { paramsTuple?: []; params?: {} }
  }
  GET: {
    'health.show': { paramsTuple?: []; params?: {} }
    'profile.profile.show': { paramsTuple?: []; params?: {} }
    'gateways.index': { paramsTuple?: []; params?: {} }
    'gateways.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'gateway_ssh_host_keys.index': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'gateway_security_alerts.index': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'gateway_ethernets.hostname': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'gateways.vpn_profile': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'gateways.network_operations': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'gateway_ethernets.device': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'gateways.ethernet.index': { paramsTuple: [ParamValue]; params: {'gateway_id': ParamValue} }
    'gateways.ethernet.show': { paramsTuple: [ParamValue,ParamValue]; params: {'gateway_id': ParamValue,'id': ParamValue} }
    'queue_healths.show': { paramsTuple?: []; params?: {} }
  }
  HEAD: {
    'health.show': { paramsTuple?: []; params?: {} }
    'profile.profile.show': { paramsTuple?: []; params?: {} }
    'gateways.index': { paramsTuple?: []; params?: {} }
    'gateways.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'gateway_ssh_host_keys.index': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'gateway_security_alerts.index': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'gateway_ethernets.hostname': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'gateways.vpn_profile': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'gateways.network_operations': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'gateway_ethernets.device': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'gateways.ethernet.index': { paramsTuple: [ParamValue]; params: {'gateway_id': ParamValue} }
    'gateways.ethernet.show': { paramsTuple: [ParamValue,ParamValue]; params: {'gateway_id': ParamValue,'id': ParamValue} }
    'queue_healths.show': { paramsTuple?: []; params?: {} }
  }
  POST: {
    'auth.access_tokens.store': { paramsTuple?: []; params?: {} }
    'profile.access_tokens.destroy': { paramsTuple?: []; params?: {} }
    'gateways.store': { paramsTuple?: []; params?: {} }
    'gateway_ssh_host_keys.rotate': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'gateway_security_alerts.acknowledge': { paramsTuple: [ParamValue,ParamValue]; params: {'id': ParamValue,'alertId': ParamValue} }
    'gateway_ethernets.apply': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'gateways.ethernet.store': { paramsTuple: [ParamValue]; params: {'gateway_id': ParamValue} }
  }
  PUT: {
    'gateways.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'gateways.ethernet.update': { paramsTuple: [ParamValue,ParamValue]; params: {'gateway_id': ParamValue,'id': ParamValue} }
  }
  PATCH: {
    'gateways.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'gateways.ethernet.update': { paramsTuple: [ParamValue,ParamValue]; params: {'gateway_id': ParamValue,'id': ParamValue} }
  }
  DELETE: {
    'gateways.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
  }
}
declare module '@adonisjs/core/types/http' {
  export interface RoutesList extends ScannedRoutes {}
}