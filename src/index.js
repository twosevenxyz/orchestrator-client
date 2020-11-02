const fs = require('fs')
const md5 = require('md5')
const Axios = require('axios')
const Emittery = require('emittery')
const StatsdClient = require('statsd-client')

const HeartbeatTask = require('./heartbeat')

class OrchestratorClient {
  constructor (url, secret) {
    new Emittery().bindMethods(this)
    this.url = url
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
    const response = await axios.post('/api/register-instance', { instanceId, port, ...data })
    return response.data
  }

  async _getConfig () {
    const { axios, instanceId } = this
    const response = await axios.get('/api/config', {
      params: { instanceId }
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
    this.instanceId = `${this._getDeviceID()}-${uniqueID}`
    await this._register(port, data)
    const config = await this._getConfig()

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
          }
        }
      }
    }

    await this.emit('init', config)
  }
}

module.exports = OrchestratorClient
