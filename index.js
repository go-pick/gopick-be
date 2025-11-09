// index.js
import express from 'express';
import cors from 'cors';
import makerRouter from './routes/makers.js';
import userRouter from './routes/users.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: 'http://localhost:3000'
}));
app.use(express.json());

app.use('/makers', makerRouter);

app.use('/auth', userRouter);

app.listen(PORT, () => {
  console.log(`🚀 '고를만해' 백엔드 서버가 포트 ${PORT}에서 실행 중입니다!`);
});