function getInitDataFromEnv () {
  const initData = JSON.parse(process.env.ORCHESTRATOR_INIT_DATA || '{}')
  return initData
}

module.exports = {
  getInitDataFromEnv
}
