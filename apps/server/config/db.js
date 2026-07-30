const sql = require('mssql');
require('dotenv').config();

const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER, // e.g. 'DESKTOP-C0O50OH'
  database: process.env.DB_DATABASE,
  options: {
    encrypt: false, // set to true if using Azure
    trustServerCertificate: true
  },
  port: 1433  // ✅ explicitly define this if needed
};

sql.connect(config)
    .then(() => console.log('✅ MSSQL Connected'))
    .catch(err => console.error('❌ DB Connection Failed', err));

module.exports = sql;


