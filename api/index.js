
const express = require('express');
const app = express();
app.use(express.json());

const users = { user1: 'password1', admin: 'admin123' };

// 루트 경로 처리
app.get('/', (req, res) => {
  res.send('Server is running!');  // 이 메시지가 Vercel URL의 루트 경로에서 보이게 됩니다.
});

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
