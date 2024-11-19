
const express = require('express');
const app = express();
app.use(express.json());

const users = { user1: 'password1', admin: 'admin123' };

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (users[username] && users[username] === password) {
    res.json({ success: true, message: 'Login successful' });
  } else {
    res.json({ success: false, message: 'Invalid username or password' });
  }
});

app.get('/', (req, res) => {
  res.send('Server is running!');
});

module.exports = app;
