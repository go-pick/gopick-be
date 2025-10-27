// index.js
import express from 'express';
import makerRouter from './routes/makers.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

app.use('/makers', makerRouter);

app.listen(PORT, () => {
  console.log(`🚀 '고를만해' 백엔드 서버가 포트 ${PORT}에서 실행 중입니다!`);
});