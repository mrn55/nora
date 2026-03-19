const {Pool} = require('pg')

const pool = new Pool({
  user: process.env.DB_USER || 'platform',
  password: process.env.DB_PASSWORD || 'platform',
  host: process.env.DB_HOST || 'postgres',
  database: process.env.DB_NAME || 'platform',
  port: parseInt(process.env.DB_PORT || '5432'),
})

module.exports = pool
