import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppContext } from '../../worker'

const { apiWorkerFetch } = vi.hoisted(() => ({ apiWorkerFetch: vi.fn() }))

vi.mock('deepspace/worker', async (importOriginal) => ({
  ...(await importOriginal<typeof import('deepspace/worker')>()),
  apiWorkerFetch,
}))

import { registerAuthAndIntegrationRoutes } from './http-routes'

describe('integration proxy', () => {
  beforeEach(() => apiWorkerFetch.mockReset())

  it('rejects unsupported endpoints before proxying upstream', async () => {
    const app = new Hono<AppContext>()
    registerAuthAndIntegrationRoutes(app)

    const response = await app.request('/api/integrations/openai/chat-completion', {
      method: 'POST',
      headers: { Authorization: 'Bearer authenticated-user' },
      body: '{}',
    })

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'Unsupported integration' })
    expect(apiWorkerFetch).not.toHaveBeenCalled()
  })
})
