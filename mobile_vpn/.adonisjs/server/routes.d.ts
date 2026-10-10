import '@adonisjs/core/types/http'

type ParamValue = string | number | bigint | boolean

export type ScannedRoutes = {
  ALL: {
    'auth.new_account.store': { paramsTuple?: []; params?: {} }
    'auth.access_tokens.store': { paramsTuple?: []; params?: {} }
    'profile.profile.show': { paramsTuple?: []; params?: {} }
    'profile.access_tokens.destroy': { paramsTuple?: []; params?: {} }
    'gateways.index': { paramsTuple?: []; params?: {} }
    'gateways.store': { paramsTuple?: []; params?: {} }
    'gateways.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'gateways.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'gateways.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'gateway_ethernets.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'gateway_ethernets.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'gateway_ethernets.hostname': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
  }
  GET: {
    'profile.profile.show': { paramsTuple?: []; params?: {} }
    'gateways.index': { paramsTuple?: []; params?: {} }
    'gateways.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'gateway_ethernets.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'gateway_ethernets.hostname': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
  }
  HEAD: {
    'profile.profile.show': { paramsTuple?: []; params?: {} }
    'gateways.index': { paramsTuple?: []; params?: {} }
    'gateways.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'gateway_ethernets.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'gateway_ethernets.hostname': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
  }
  POST: {
    'auth.new_account.store': { paramsTuple?: []; params?: {} }
    'auth.access_tokens.store': { paramsTuple?: []; params?: {} }
    'profile.access_tokens.destroy': { paramsTuple?: []; params?: {} }
    'gateways.store': { paramsTuple?: []; params?: {} }
  }
  PUT: {
    'gateways.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'gateway_ethernets.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
  }
  PATCH: {
    'gateways.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
  }
  DELETE: {
    'gateways.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
  }
}
declare module '@adonisjs/core/types/http' {
  export interface RoutesList extends ScannedRoutes {}
}