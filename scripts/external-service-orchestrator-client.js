const OrchestratorClient = require('../index')
const findProcess = require('find-process')
const { getInitDataFromEnv } = require('../src/utils')
const argv = require('minimist')(process.argv.slice(2))

const url = argv['orchestrator-url'] || process.env.ORCHESTRATOR_URL
const secret = argv['orchestrator-secret'] || process.env.ORCHESTRATOR_SECRET
const externalServiceName = argv['external-service-name'] || process.env.ORCHESTRATOR_EXTERNAL_SERVICE_NAME
const initData = JSON.parse(argv['init-data'] || getInitDataFromEnv())

const port = argv['orchestrator-service-port'] || process.env.ORCHESTRATOR_SERVICE_PORT

;(async () => {
  const client = new OrchestratorClient(url, secret)
  await client.init(port, initData)

  if (externalServiceName) {
    // At this point, the heartbeat task should've been set up. Hijack it
    const { heartbeatTask } = client
    let { heartbeat: origHeartbeatFn } = heartbeatTask
    origHeartbeatFn = origHeartbeatFn.bind(heartbeatTask)
    const minProcessCount = argv['external-service-name'] ? 2 : 1 // If the process name is specified in argv, then this node process always be reported by find-process. So we expect 2 instead
    heartbeatTask.heartbeat = async () => {
      const processes = await findProcess('name', externalServiceName)
      if (processes.length < minProcessCount) { // The process itself will always be
      // Do not trigger heartbeat
        return
      }
      origHeartbeatFn()
    }
  }

  const signals = {
    SIGHUP: 1,
    SIGINT: 2,
    SIGTERM: 15
  }
  // Do any necessary shutdown logic for our application here
  const shutdown = async (signal, value) => {
    console.log('shutdown!')
    await client.destroy()
    console.log(`external-service-orchestrator-client stopped by ${signal} with value ${value}`)
    process.exit(128 + value)
  }
  // Create a listener for each of the signals that we want to handle
  Object.keys(signals).forEach((signal) => {
    process.on(signal, () => {
      console.log(`process received a ${signal} signal`)
      shutdown(signal, signals[signal])
    })
  })
})()
