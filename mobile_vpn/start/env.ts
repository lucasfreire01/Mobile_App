/*
|--------------------------------------------------------------------------
| Environment variables service
|--------------------------------------------------------------------------
|
| The `Env.create` method creates an instance of the Env service. The
| service validates the environment variables and also cast values
| to JavaScript data types.
|
*/

import { Env } from '@adonisjs/core/env'

export default await Env.create(new URL('../', import.meta.url), {
  // Node
  NODE_ENV: Env.schema.enum(['development', 'production', 'test'] as const),
  PORT: Env.schema.number(),
  HOST: Env.schema.string({ format: 'host' }),
  LOG_LEVEL: Env.schema.string(),

  // App
  APP_KEY: Env.schema.secret(),
  APP_URL: Env.schema.string({ format: 'url', tld: false }),

  // Session
  SESSION_DRIVER: Env.schema.enum(['cookie', 'memory', 'database'] as const),

  // Database
  DB_CONNECTION: Env.schema.enum(['sqlite', 'pg'] as const),
  DB_HOST: Env.schema.string({ format: 'host' }),
  DB_PORT: Env.schema.number(),
  DB_USER: Env.schema.string(),
  DB_PASSWORD: Env.schema.secret(),
  DB_DATABASE: Env.schema.string(),

  // Browan SSH
  BROWAN_SSH_KEY_PATH: Env.schema.string(),
  BROWAN_SSH_USERNAME: Env.schema.string(),
  BROWAN_SSH_PORT: Env.schema.number(),
  GATEWAY_MONITOR_CONCURRENCY: Env.schema.number.optional(),
  GATEWAY_MONITOR_BATCH_SIZE: Env.schema.number.optional(),
  GATEWAY_MONITOR_TIMEOUT_MS: Env.schema.number.optional(),
  GATEWAY_MONITOR_CYCLE_TIMEOUT_MS: Env.schema.number.optional(),

  // CloudConnexa
  CLOUDCONNEXA_BASE_URL: Env.schema.string({ format: 'url', tld: false }),
  CLOUDCONNEXA_CLIENT_ID: Env.schema.string(),
  CLOUDCONNEXA_CLIENT_SECRET: Env.schema.secret(),
  CLOUDCONNEXA_REGION: Env.schema.string.optional(),
  CLOUDCONNEXA_ACCESS_GROUP_ID: Env.schema.string.optional(),
  // Management IPs are allocated as <prefix>.2 .. <prefix>.254
  GATEWAY_MGMT_IP_PREFIX: Env.schema.string.optional(),
  GATEWAY_SSH_ALLOWED_CIDRS: Env.schema.string.optional(),

  // Development seed
  SEED_ADMIN_EMAIL: Env.schema.string(),
  SEED_ADMIN_PASSWORD: Env.schema.secret(),

  // Queue monitoring
  QUEUE_HEALTH_MAX_PENDING_AGE_SECONDS: Env.schema.number.optional(),
  QUEUE_HEALTH_MAX_WORKER_AGE_SECONDS: Env.schema.number.optional(),
  QUEUE_HEALTH_HOST_KEY_MISMATCH_WINDOW_SECONDS: Env.schema.number.optional(),
  GATEWAY_STATIC_ROLLBACK_DELAY_SECONDS: Env.schema.number.optional(),

  /*
  |----------------------------------------------------------
  | Variables for configuring the limiter package
  |----------------------------------------------------------
  */
  LIMITER_STORE: Env.schema.enum(['database', 'memory'] as const),
})
