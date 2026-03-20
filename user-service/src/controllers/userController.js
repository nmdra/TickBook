const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

const register = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required.' });
    }

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email already registered.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role, created_at, updated_at',
      [name, email, hashedPassword, role || 'user']
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Register error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

const getProfile = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, role, created_at, updated_at FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get profile error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

const getUserById = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, role, created_at, updated_at FROM users WHERE id = $1',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get user by ID error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

const listUsers = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, role, created_at, updated_at FROM users ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (err) {
    console.error('List users error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, password, role } = req.body;

    if (req.user.id !== parseInt(id, 10) && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'You can only update your own profile.' });
    }

    const fields = [];
    const values = [];
    let paramIndex = 1;

    if (name) {
      fields.push(`name = $${paramIndex++}`);
      values.push(name);
    }
    if (email) {
      fields.push(`email = $${paramIndex++}`);
      values.push(email);
    }
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      fields.push(`password = $${paramIndex++}`);
      values.push(hashedPassword);
    }
    if (role && req.user.role === 'admin') {
      fields.push(`role = $${paramIndex++}`);
      values.push(role);
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update.' });
    }

    fields.push(`updated_at = NOW()`);
    values.push(id);

    const query = `UPDATE users SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING id, name, email, role, created_at, updated_at`;
    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update user error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    if (req.user.id !== parseInt(id, 10) && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'You can only delete your own account.' });
    }

    const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    res.json({ message: 'User deleted successfully.' });
  } catch (err) {
    console.error('Delete user error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

module.exports = { register, login, getProfile, getUserById, listUsers, updateUser, deleteUser };
