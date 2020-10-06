const fs = require('fs')
const md5 = require('md5')
const Axios = require('axios')
const Emittery = require('emittery')

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
    const { axios } = this
    const response = await axios.get('/api/config')
    return response.data
  }

  async init (uniqueID) {
    this.instanceId = `${this._getDeviceID()}-${uniqueID}`
    await this._register()
    const config = await this._getConfig()
    const { heartbeatInterval } = config

    if (heartbeatInterval) {
      this.heartbeatTask = new HeartbeatTask(this.axios, this.instanceId, heartbeatInterval)
      this.heartbeatTask.start()
    }
    await this.emit('init', config)
  }
}

module.exports = OrchestratorClient
