import express from 'express';
import { supabase } from '../config/supabaseClient.js';

const historyRouter = express.Router();

historyRouter.get('/', async (req, res) => {
	try {
		const token = req.headers.authorization?.split(' ')[1];
		if (!token) return res.status(401).json({ error: 'Unauthorized' });

		const { data: { user }, error: authError } = await supabase.auth.getUser(token);

		if (authError) {
		console.error("🔥 인증 실패 원인:", authError.message);
		// 토큰이 이상한지 확인하기 위해 앞부분만 살짝 출력
		console.log("받은 토큰(앞 20자):", token.substring(0, 20)); 
}

		if (authError || !user) return res.status(401).json({ error: 'Invalid token' });

		// 1. 조회
		const { data, error } = await supabase
			.from('history')
			.select(`
				id,
				created_at,
				preference,
				category:category_id ( id, name, specs ),
				score (
					score,
					product_variants ( product ( name ) )
				)
			`)
			.eq('user_id', user.id)
			.order('created_at', { ascending: false })
		;

		if (error) throw error;

		// 2. 데이터 가공
		const formattedList = data.map((item, index) => {
			const scores = item.score || [];
			scores.sort((a, b) => b.score - a.score);
			
			const winnerName = scores[0]?.product_variants?.product?.name || '제품';
			const count = scores.length;
			const title = count > 1 ? `${winnerName} 외 ${count - 1}개 비교` : `${winnerName} 비교`;

			// --- [진단 로그 시작] (첫 번째 아이템만 상세 출력) ---
			const categoryData = Array.isArray(item.category) ? item.category[0] : item.category;
			const specsList = categoryData?.specs || [];

			const summarySpecs = Object.entries(item.preference || {})
				.filter(([key, val]) => val > 0)
				.map(([key]) => {
					if (key === 'price') return '가격';

					// 매핑 로직 (기존 유지)
					const foundSpec = specsList.find(s => s.eng_name === key);
					
					if (foundSpec) {
						return foundSpec.kor_name;
					}
				});

			return {
				id: item.id,
				created_at: item.created_at,
				title: title,
				specsSummary: summarySpecs 
			};
		});

		res.json(formattedList);

	} catch (error) {
		res.status(500).json({ error: 'Failed to fetch history list' });
	}
});

historyRouter.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        // 1. 토큰 인증
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ error: 'Unauthorized' });

        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) return res.status(401).json({ error: 'Invalid token' });

        // 2. 상세 데이터 조회
        const { data: historyItem, error } = await supabase
            .from('history')
            .select(`
                id,
                created_at,
                preference,
                category:category_id ( id, name, specs ),
                score (
                    score,
                    variant_id,
                    product_variants (
                        id,
                        price,
                        option_specs,
                        variant_name,
                        product (
                            name,
                            image_url,
                            common_specs,
                            maker:maker_id ( name )
                        )
                    )
                )
            `)
            .eq('id', id)
            .eq('user_id', user.id) // 내 기록인지 확인
            .single();

        // [진단 3] DB 조회 결과 확인
        if (error) {
            console.error("[BE] DB 조회 에러:", error);
        } else if (!historyItem) {
            console.error("[BE] 데이터 없음 (Row not found)");
        } else {
            console.log("[BE] 데이터 조회 성공!");
        }

        if (error || !historyItem) {
            return res.status(404).json({ error: 'History not found' });
        }

        // ... (이하 데이터 가공 및 응답 로직은 기존과 동일) ...
        
        // (편의를 위해 아래 부분은 기존 코드를 유지하세요)
        const categorySpecs = Array.isArray(historyItem.category) ? historyItem.category[0]?.specs : historyItem.category?.specs;
        const priceSpecDef = { eng_name: 'price', kor_name: '가격', unit: '원', is_positive: false, icon_key: 'price' };
        const dbSpecs = (categorySpecs || []).filter(s => s.eng_name.toLowerCase() !== 'price');
        const specDefinitions = [priceSpecDef, ...dbSpecs];

        const scores = historyItem.score || [];
        scores.sort((a, b) => b.score - a.score);

        const mergeSpecs = (variant) => ({
            price: variant.price,
            ...(variant.product?.common_specs || {}),
            ...(variant.option_specs || {})
        });

        const rankedData = scores.map(s => {
            const v = s.product_variants;
            const p = v.product;
            return {
                unique_id: s.variant_id,
                name: p.name,
                variant_name: v.variant_name,
                brand: p.maker?.name || 'Unknown',
                image_url: p.image_url,
                price: v.price,
                score: s.score,
                specs: mergeSpecs(v)
            };
        });

        res.json({
            rankedData: rankedData,
            specDefinitions: specDefinitions,
            weights: historyItem.preference,
            created_at: historyItem.created_at
        });

    } catch (error) {
        console.error("History Detail Error:", error);
        res.status(500).json({ error: 'Failed to fetch history detail' });
    }
});
export default historyRouter;