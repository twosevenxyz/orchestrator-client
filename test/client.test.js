import dgram from 'dgram'
import express from 'express'
import portfinder from 'portfinder'
import { v4 as uuidv4 } from 'uuid'
import OrchestratorClient from '../index'
import Emittery from 'emittery'
import { testForEvent } from '@gurupras/test-helpers'

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

  beforeEach(async () => {
    jest.restoreAllMocks()
  })

  afterAll(async () => {
    return new Promise(resolve => server.close(resolve))
  })

  beforeEach(() => {
    config = {}
  })

  test('init registers instance', async () => {
    const promise = client.init('test')
    await promise
    await expect(promise).toResolve()
  })

  test('init with data containing <random-uuid> replaces value with a uuid', async () => {
    const data = {
      uuid: '<random-uuid>'
    }

    jest.spyOn(client, '_register')
    const promise = client.init('test', data)
    await expect(promise).toResolve()
    expect(client._register).toHaveBeenCalledWith('test', {
      ...data,
      uuid: expect.not.stringContaining('<random-uuid>')
    })
  })

  test('Starts heartbeat task if config contains heartbeatInterval', async () => {
    config = {
      modules: [
        {
          type: 'heartbeat',
          config: {
            heartbeatInterval: 100
          }
        }
      ]
    }
    const promise = bus.once('heartbeat')
    await expect(client.init('test')).toResolve()
    await expect(promise).toResolve()
    await expect(client.heartbeatTask.stop()).toResolve()
  })

  test('Calling metrics.log does not fail regardless of configuration', async () => {
    expect(() => client.metrics.log('test', 'load', 0.5)).not.toThrow()
  })

  describe('Metrics', () => {
    let statsdPort
    let server
    beforeEach(async () => {
      statsdPort = await portfinder.getPortPromise()
      server = dgram.createSocket('udp4')
      server.bind(statsdPort, '127.0.0.1')
    })
    afterEach(async () => {
      return new Promise(resolve => server.close(resolve))
    })

    function getStatsdConfig () {
      return {
        type: 'statsd',
        config: {
          client: {
            host: '127.0.0.1',
            port: statsdPort,
            socketTimeout: 100
          }
        }
      }
    }

    test('Logs statsd metrics correctly upon specifying config', async () => {
      const promise = testForEvent(server, 'message')

      config = {
        modules: [getStatsdConfig()]
      }
      await expect(client.init('test')).toResolve()
      await expect(client.metrics.log('gauge', 'load', 0.5)).toResolve()
      await expect(promise).toResolve()
    })

    test('Adds prefix if specified', async () => {
      const statsdConfig = getStatsdConfig()
      statsdConfig.config.prefix = 'group.zone'
      config = {
        modules: [statsdConfig]
      }

      const msgs = []
      server.on('message', msg => {
        msgs.push(msg)
      })
      const promise = testForEvent(server, 'message')
      await expect(client.init('test')).toResolve()
      await expect(client.metrics.log('gauge', 'load', 0.5)).toResolve()
      await expect(promise).toResolve()

      expect(msgs).toBeArrayOfSize(1)

      const [msg] = msgs
      const str = msg.toString('utf-8')
      expect(str).toContain('group.zone.')
    })
  })
})
