const debug = require('debug')('orchestrator-client:heartbeat')

class HeartbeatTask {
  constructor (axios, instanceId, { interval }) {
    this.axios = axios
    this.instanceId = instanceId
    this.stopped = false
    this.interval = interval
  }

  async heartbeat () {
    const { axios, instanceId } = this
    return axios.get(`/api/heartbeat/${instanceId}`)
  }

  async stop () {
    this.stopped = true
    this.heartbeatTask && clearInterval(this.heartbeatTask)
    delete this.heartbeatTask
  }

  async start () {
    const { interval } = this
    this.stopped = false

    const task = async () => {
      if (this.stopped) {
        return
      }
      try {
        await this.heartbeat()
      } catch (e) {
        debug(`Error sending heartbeat: ${e.message}`)
      }
    }
    this.heartbeatTask = setInterval(task, interval)
  }
}

module.exports = HeartbeatTask
