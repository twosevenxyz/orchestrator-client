const fs = require('fs')
const md5 = require('md5')
const { v4: uuidv4 } = require('uuid')
const Axios = require('axios')
const Emittery = require('emittery')
const StatsdClient = require('statsd-client')

const HeartbeatTask = require('./heartbeat')

const { Logger } = require('@gurupras/log')
const { getInitDataFromEnv } = require('./utils')

const log = new Logger('orchestrator-client')

class OrchestratorClient {
  constructor (url, secret) {
    new Emittery().bindMethods(this)
    this.url = url
    /** @type{Axios.AxiosInstance} */
    this.axios = Axios.create({
      baseURL: url,
      headers: {
        Authorization: `Bearer ${secret}`
      }
    })
  }

  _getDeviceID () {
    return md5(fs.readFileSync('/var/lib/dbus/machine-id'))
  }

  async _register (port, data) {
    if (!port) {
      throw new Error('Must specify port when registering instance')
    }
    data = data || {}
    const { axios, instanceId } = this
    const response = await axios.post('/api/register-instance', { instanceID: instanceId, instanceId, port, ...data })
    return response.data
  }

  async _getConfig () {
    const { axios, instanceId } = this
    const response = await axios.get('/api/config', {
      params: { instanceID: instanceId, instanceId }
    })
    return response.data
  }

  /**
   * Initialize the orchestrator client
   * @param {Number} port The port that the service listens on
   * @param {Object} data Additional attributes to register service with
   * @param {String} uniqueID a unique ID that will be suffixed to the machine ID. This is to be used in cases where the same machine has multiple services
   */
  async init (port, data, uniqueID = port) {
    if (!data) {
      // Check environment variable
      data = JSON.parse(getInitDataFromEnv())
    }
    this.instanceId = `${this._getDeviceID()}-${uniqueID}`
    log.info(`instanceID=${this.instanceId}`)
    if (data) {
      for (const [k, v] of Object.entries(data)) {
        if (v === '<random-uuid>') {
          data[k] = uuidv4()
        }
      }
    }
    const registrationResponse = await this._register(port, data)
    log.debug('Registered instance', registrationResponse)
    const config = await this._getConfig()
    log.debug('Received config', config)

    this.metrics = { log () {} }

    if (config) {
      const { modules = [] } = config
      for (const mod of modules) {
        const { type, config } = mod
        switch (type) {
          case 'heartbeat': {
            const { heartbeat_interval: heartbeatInterval } = config
            this.heartbeatTask = new HeartbeatTask(this.axios, this.instanceId, heartbeatInterval)
            this.heartbeatTask.start()
            break
          }
          case 'statsd': {
            const { client, prefix } = config
            this.statsd = new StatsdClient(client)
            this.metrics = {
              log: async (fn, metric, value, ...args) => {
                const metricTokens = [metric]
                if (prefix) {
                  metricTokens.unshift(prefix)
                }
                const finalMetric = metricTokens.join('.')
                return this.statsd[fn](finalMetric, value, ...args)
              }
            }
            log.debug('Initialized statsd', { client, prefix })
          }
        }
      }
    }

    if (this.heartbeatTask) {
      this.heartbeatTask.on('tasks', async tasks => {
        // Right now, only exit is defined
        let exitTask
        for (const task of tasks) {
          const { type } = task
          switch (type) {
            case 'exit':
              // We don't run this right away, since we want to make sure we complete other tasks
              exitTask = task
              break
          }
        }
        if (exitTask) {
          await this.emit('exit', exitTask)
          await this.destroy()
        }
      })
    }
    await this.emit('init', config)
  }

  async destroy () {
    const { instanceId, axios } = this
    try {
      await axios.delete(`/api/destroy/${instanceId}`)
    } catch (e) {
      log.error('Failed to make API request to delete instance')
    }
  }
}

module.exports = OrchestratorClient
