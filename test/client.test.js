import express from 'express'
import portfinder from 'portfinder'
import { v4 as uuidv4 } from 'uuid'
import OrchestratorClient from '../index'
import Emittery from 'emittery'

describe('OrchestratorClient', () => {
  let secret
  let app
  let port
  let server
  let client
  let config
  let bus
  beforeAll(async () => {
    secret = uuidv4()
    bus = new Emittery()

    app = express()
    app.use('/api', (req, res, next) => {
      const { headers: { authorization = '' } } = req
      const token = authorization.substr(7)
      if (token !== secret) {
        return res.status(400).send('Forbidden')
      }
      next()
    })
    app.post('/api/register-instance', (req, res) => {
      res.send('OK')
    })
    app.get('/api/config', async (req, res) => {
      res.send(config)
    })

    app.get('/api/heartbeat/:instance', async (req, res) => {
      const { params: { instance } } = req
      res.send('OK')
      bus.emit('heartbeat', instance)
    })

    port = await portfinder.getPortPromise()
    server = app.listen(port)

    client = new OrchestratorClient(`http://localhost:${port}`, secret)
  })

  afterAll(async () => {
    return new Promise(resolve => server.close(resolve))
  })

  beforeEach(() => {
    config = {}
  })

  test('init registers instance', async () => {
    await expect(client.init('test')).toResolve()
  })

  test('Starts heartbeat task if config contains heartbeatInterval', async () => {
    config.heartbeatInterval = 100
    const promise = bus.once('heartbeat')
    await expect(client.init('test')).toResolve()
    await expect(promise).toResolve()
    await expect(client.heartbeatTask.stop()).toResolve()
  })
})
