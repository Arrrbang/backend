const express = require('express');
const cors = require('cors'); // CORS 모듈 추가

const app = express();

app.use(cors()); // CORS 설정 적용
app.use(express.json());

const users = { user1: 'password1', admin: 'admin123' };

app.get('/', (req, res) => {
  res.send('Server is running!');
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (users[username] && users[username] === password) {
    res.json({ success: true, message: 'Login successful' });
  } else {
    res.json({ success: false, message: 'Invalid username or password.' });
  }
});

module.exports = app;
