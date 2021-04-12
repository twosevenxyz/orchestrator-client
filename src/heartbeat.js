const debug = require('debug')('orchestrator-client:heartbeat')
const Emittery = require('emittery')

class HeartbeatTask {
  constructor (axios, instanceId, interval) {
    this.axios = axios
    this.instanceId = instanceId
    this.stopped = false
    this.interval = interval
    new Emittery().bindMethods(this)
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
        const response = await this.heartbeat()
        const { data } = response
        if (Object.keys(data).length > 0) {
          await this.emit('tasks', data)
        }
      } catch (e) {
        debug(`Error sending heartbeat: ${e.message}`)
      }
    }
    this.heartbeatTask = setInterval(task, interval)
  }
}

module.exports = HeartbeatTask
