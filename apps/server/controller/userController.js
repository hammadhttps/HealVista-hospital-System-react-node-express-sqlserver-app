const sql = require('mssql');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const loginUser = async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required.' });
  }
  try {
    const request = new sql.Request();
    request.input('username', sql.VarChar(50), username);
    const result = await request.query(`SELECT * FROM Users WHERE username = @username`);
    if (result.recordset.length === 0) {
      return res.status(401).json({ message: 'Invalid username or password.' });
    }
    const user = result.recordset[0];
    let passwordMatch = false;
    try {
      passwordMatch = await bcrypt.compare(password, user.password_hash);
    } catch (e) {
      passwordMatch = false;
    }
    // TEMPORARY: Allow plain text password match for testing
    if (!passwordMatch && password === user.password_hash) {
      passwordMatch = true;
    }
    if (!passwordMatch) {
      return res.status(401).json({ message: 'Invalid username or password.' });
    }
    // Generate JWT
    const token = jwt.sign({ user_id: user.user_id, role: user.role, full_name: user.full_name }, process.env.JWT_SECRET || 'secret', { expiresIn: '1d' });
    res.json({ token, user: { user_id: user.user_id, username: user.username, role: user.role, full_name: user.full_name, email: user.email, phone: user.phone } });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

const getAllUsers = async (req, res) => {
  try {
    const request = new sql.Request();
    const result = await request.query('SELECT user_id, username, role, full_name, email, phone FROM Users');
    res.json(result.recordset);
  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).json({ message: 'Error fetching users', error: err.message });
  }
};

module.exports = { loginUser, getAllUsers }; 