// Redis based job queue using BullMQ

const { Queue } = require('bullmq')
const IORedis = require('ioredis')

const connection = new IORedis({
  host: process.env.REDIS_HOST || 'redis',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: null,
})

const deployQueue = new Queue('deployments', { connection })

async function addDeploymentJob(agent){
  await deployQueue.add('deploy-agent', agent)
}

module.exports = { deployQueue, addDeploymentJob, connection }
