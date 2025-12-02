import express from 'express';
import { supabase } from '../config/supabaseClient.js';
import dotenv from 'dotenv'; 
dotenv.config();

const categoryRouter = express.Router();

categoryRouter.get('/', async (req, res) => {
	try {
		// 1. Supabase에서 카테고리 데이터 조회
		const { data, error } = await supabase
			.from('category')
			.select('id, slug, name, specs')
			.order('id', { ascending: true })
		;

		// 2. Supabase 에러 처리
		if (error) {
			console.error('Supabase Error:', error.message);
			return res.status(500).json({ error: '데이터를 불러오지 못했습니다.' });
		}

		// 3. 성공 시 데이터 반환
		return res.status(200).json(data);

	} catch (err) {
		// 4. 서버 내부 에러 처리
		console.error('Server Error:', err);
		return res.status(500).json({ error: '서버 내부 오류가 발생했습니다.' });
	}
});

export default categoryRouter;