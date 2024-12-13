const express = require('express');
const cors = require('cors'); // CORS 모듈 추가
const jwt = require('jsonwebtoken'); // JWT 모듈 추가

const app = express();

app.use(cors()); // CORS 설정 적용
app.use(express.json());

// JWT 비밀 키 (환경 변수로 설정 가능)
const SECRET_KEY = process.env.SECRET_KEY;
const users = { user1: 'password1', admin: 'admin123' };

// 노션 API 클라이언트 초기화
const notion = new Client({ auth: process.env.NOTION_API_KEY });

// 기본 경로
app.get('/', (req, res) => {
  res.send('Server is running!');
});

// 로그인 API: JWT 발행
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (users[username] && users[username] === password) {
    // JWT 발행
    const token = jwt.sign({ username }, SECRET_KEY, { expiresIn: '1h' }); // 유효 기간: 1시간
    res.json({ success: true, message: 'Login successful', token });
  } else {
    res.status(401).json({ success: false, message: 'Invalid username or password.' });
  }
});

// JWT 검증 API
app.post('/verifyToken', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1]; // Authorization 헤더에서 토큰 추출

  if (!token) {
    return res.status(401).json({ success: false, message: 'Token is required.' });
  }

  try {
    const decoded = jwt.verify(token, SECRET_KEY); // 토큰 검증
    res.json({ success: true, user: decoded }); // 검증 성공 시 사용자 정보 반환
  } catch (error) {
    res.status(401).json({ success: false, message: 'Invalid or expired token.' });
  }
});

// 인증 미들웨어
function authenticateToken(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: 'Token is required.' });
  }

  try {
    const decoded = jwt.verify(token, SECRET_KEY); // 토큰 검증
    req.user = decoded; // 디코딩된 사용자 정보 저장
    next(); // 다음 미들웨어로 이동
  } catch {
    res.status(403).json({ success: false, message: 'Invalid or expired token.' });
  }
}

// 보호된 API 예시
app.get('/protected', authenticateToken, (req, res) => {
  res.json({ success: true, message: `Hello ${req.user.username}, you have access to this route.` });
});

module.exports = app;
