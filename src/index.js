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

  async _register () {
    const { axios, instanceId } = this
    const response = await axios.post('/api/register-instance', { instanceId })
    return response.data
  }

  async _getConfig () {
    const { axios, instanceId } = this
    const response = await axios.get('/api/config', {
      params: { instanceId }
    })
    return response.data
  }

  async init (uniqueID) {
    this.instanceId = `${this._getDeviceID()}-${uniqueID}`
    await this._register()
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
