/* eslint-disable prettier/prettier */
/// <reference path="../manifest.d.ts" />

import type { ExtractBody, ExtractErrorResponse, ExtractQuery, ExtractQueryForGet, ExtractResponse } from '@tuyau/core/types'
import type { InferInput, SimpleError } from '@vinejs/vine/types'

export type ParamValue = string | number | bigint | boolean

export interface Registry {
  'health.show': {
    methods: ["GET","HEAD"]
    pattern: '/health'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/health_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/health_controller').default['show']>>>
    }
  }
  'auth.access_tokens.store': {
    methods: ["POST"]
    pattern: '/api/v1/auth/login'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/user').loginValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/user').loginValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/access_tokens_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/access_tokens_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'profile.profile.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/account/profile'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/profile_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/profile_controller').default['show']>>>
    }
  }
  'profile.access_tokens.destroy': {
    methods: ["POST"]
    pattern: '/api/v1/account/logout'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/access_tokens_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/access_tokens_controller').default['destroy']>>>
    }
  }
  'gateways.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/gateways'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/gateways_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/gateways_controller').default['index']>>>
    }
  }
  'gateways.store': {
    methods: ["POST"]
    pattern: '/api/v1/gateways'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/gateway').createGatewayValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/gateway').createGatewayValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/gateways_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/gateways_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'gateways.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/gateways/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/gateways_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/gateways_controller').default['show']>>>
    }
  }
  'gateways.update': {
    methods: ["PUT","PATCH"]
    pattern: '/api/v1/gateways/:id'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/gateway').updateGatewayValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/gateway').updateGatewayValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/gateways_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/gateways_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'gateways.destroy': {
    methods: ["DELETE"]
    pattern: '/api/v1/gateways/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/gateways_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/gateways_controller').default['destroy']>>>
    }
  }
  'users.store': {
    methods: ["POST"]
    pattern: '/api/v1/users'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/user').createUserValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/user').createUserValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/users_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/users_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'gateway_ssh_host_keys.rotate': {
    methods: ["POST"]
    pattern: '/api/v1/gateways/:id/ssh-host-key/rotate'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/gateway').rotateGatewaySshHostKeyValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/gateway').rotateGatewaySshHostKeyValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/gateway_ssh_host_keys_controller').default['rotate']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/gateway_ssh_host_keys_controller').default['rotate']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'gateway_ssh_host_keys.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/gateways/:id/ssh-host-key/rotations'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/gateway_ssh_host_keys_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/gateway_ssh_host_keys_controller').default['index']>>>
    }
  }
  'gateway_security_alerts.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/gateways/:id/security-alerts'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/gateway_security_alerts_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/gateway_security_alerts_controller').default['index']>>>
    }
  }
  'gateway_security_alerts.acknowledge': {
    methods: ["POST"]
    pattern: '/api/v1/gateways/:id/security-alerts/:alertId/acknowledge'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { id: ParamValue; alertId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/gateway_security_alerts_controller').default['acknowledge']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/gateway_security_alerts_controller').default['acknowledge']>>>
    }
  }
  'gateway_ethernets.hostname': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/gateways/:id/ethernet/hostname'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/gateway_ethernets_controller').default['hostname']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/gateway_ethernets_controller').default['hostname']>>>
    }
  }
  'gateways.vpn_profile': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/gateways/:id/vpn-profile'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/gateways_controller').default['vpnProfile']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/gateways_controller').default['vpnProfile']>>>
    }
  }
  'gateways.network_operations': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/gateways/:id/network-operations'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/gateways_controller').default['networkOperations']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/gateways_controller').default['networkOperations']>>>
    }
  }
  'gateway_ethernets.device': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/gateways/:id/ethernet/device'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/gateway_ethernets_controller').default['device']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/gateway_ethernets_controller').default['device']>>>
    }
  }
  'gateway_ethernets.apply': {
    methods: ["POST"]
    pattern: '/api/v1/gateways/:id/ethernet/apply'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/gateway_ethernets_controller').default['apply']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/gateway_ethernets_controller').default['apply']>>>
    }
  }
  'gateways.ethernet.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/gateways/:gateway_id/ethernet'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { gateway_id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/gateway_ethernets_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/gateway_ethernets_controller').default['index']>>>
    }
  }
  'gateways.ethernet.store': {
    methods: ["POST"]
    pattern: '/api/v1/gateways/:gateway_id/ethernet'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/gateway_ethernet_config').updateGatewayEthernetConfValidator)>>
      paramsTuple: [ParamValue]
      params: { gateway_id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/gateway_ethernet_config').updateGatewayEthernetConfValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/gateway_ethernets_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/gateway_ethernets_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'gateways.ethernet.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/gateways/:gateway_id/ethernet/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { gateway_id: ParamValue; id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/gateway_ethernets_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/gateway_ethernets_controller').default['show']>>>
    }
  }
  'gateways.ethernet.update': {
    methods: ["PUT","PATCH"]
    pattern: '/api/v1/gateways/:gateway_id/ethernet/:id'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/gateway_ethernet_config').updateGatewayEthernetConfValidator)>>
      paramsTuple: [ParamValue, ParamValue]
      params: { gateway_id: ParamValue; id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/gateway_ethernet_config').updateGatewayEthernetConfValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/gateway_ethernets_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/gateway_ethernets_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'queue_healths.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/health/queue'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/queue_healths_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/queue_healths_controller').default['show']>>>
    }
  }
}
