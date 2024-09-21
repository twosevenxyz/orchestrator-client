function getInitDataFromEnv () {
  const initData = process.env.ORCHESTRATOR_INIT_DATA || '{}'
  console.log(`[getInitDataFromEnv]: Returning: ${initData}`)
  return initData
}

module.exports = {
  getInitDataFromEnv
}
