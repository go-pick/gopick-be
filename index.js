// index.js
import express from 'express';
import cors from 'cors';
import makerRouter from './routes/makers.js';
import userRouter from './routes/users.js';

import dotenv from 'dotenv'; 
import categoryRouter from './routes/categories.js';
import productRouter from './routes/products.js';
import historyRouter from './routes/histories.js';
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const CLIENT = process.env.CLIENT_URL

app.use(cors({
	origin: [
		CLIENT,
		'http://localhost:3000'
	],
	credentials: true,
	optionsSuccessStatus: 200
}));
app.use(express.json());

app.use('/makers', makerRouter);

app.use('/auth', userRouter);

app.use('/categories', categoryRouter);

app.use('/products', productRouter);

app.use('/history', historyRouter);

app.listen(PORT, () => {
	console.log(`🚀 '고를만해' 백엔드 서버가 포트 ${PORT}에서 실행 중입니다!`);
});