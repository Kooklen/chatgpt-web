const mysql = require('mysql2/promise')

const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: 'qqq111',
  database: 'mydatabase',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
})

async function executeQuery(query, values) {
  const connection = await pool.getConnection()
  try {
    const [rows] = await connection.query(query, values)
    return rows
  }
  finally {
    connection.release()
  }
}

module.exports = {
  executeQuery,
}
