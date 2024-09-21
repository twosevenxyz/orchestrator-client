function getInitDataFromEnv () {
  const initData = process.env.ORCHESTRATOR_INIT_DATA || '{}'
  return initData
}

module.exports = {
  getInitDataFromEnv
}
