import express from 'express';
import { supabase } from '../config/supabaseClient.js';

const historyRouter = express.Router();

// GET /api/history (내 기록 목록 조회)
historyRouter.get('/', async (req, res) => {
	try {
		const token = req.headers.authorization?.split(' ')[1];
		if (!token) return res.status(401).json({ error: 'Unauthorized' });

		const { data: { user }, error: authError } = await supabase.auth.getUser(token);
		if (authError || !user) return res.status(401).json({ error: 'Invalid token' });

		// 1. History 조회 (최신순 정렬)
		// score 테이블을 조인해서 제품 정보와 점수를 가져옵니다.
		const { data, error } = await supabase
			.from('history')
			.select(`
				id,
				created_at,
				preference,
				score (
					score,
					variant_id,
					product_variants (
						variant_name,
						product ( name )
					)
				)
			`)
			.eq('user_id', user.id)
			.order('created_at', { ascending: false })
		;

		if (error) throw error;

		// 2. 데이터 가공 (프론트에서 보여주기 좋게)
		const formattedData = data.map(item => {
			// 점수순 정렬
			const scores = item.score.sort((a, b) => b.score - a.score);
			
			// 1등 제품 이름 찾기
			const winner = scores[0];
			const winnerName = winner?.product_variants?.product?.name || '제품';
			
			// 제목 생성 (A안: 1등 외 N개)
			const count = scores.length;
			const title = count > 1 
				? `${winnerName} 외 ${count - 1}개 비교` 
				: `${winnerName} 비교`
			;

			// 중요 스펙 목록 문자열 생성
			// preference: { battery: 5, price: 3, ... }
			const importantSpecs = Object.entries(item.preference || {})
				.filter(([key, value]) => value > 0 && key !== 'price') // 가격 제외하고 스펙만? (선택사항)
				.map(([key]) => key)
			; // 한글 변환은 프론트에서 처리 추천
				
			return {
				id: item.id,
				created_at: item.created_at,
				title: title,
				specs: importantSpecs, // ['battery', 'weight'] 형태
				preference: item.preference // 상세페이지용
			};
		});
		
		res.json(formattedData);
	} catch (error) {
		console.error("History fetch error:", error);
		res.status(500).json({ error: 'Failed to fetch history' });
	}
});

// GET /api/history/:id (상세 조회 - 결과 페이지 복원용)
historyRouter.get('/:id', async (req, res) => {
    // ... (상세 페이지 구현 시 필요, 일단 목록부터)
});

export default historyRouter;