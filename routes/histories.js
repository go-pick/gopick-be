import express from 'express';
import { supabase } from '../config/supabaseClient.js';

const historyRouter = express.Router();

// =========================================================
// [GET] 내역 리스트 조회 (최적화 버전) + 페이징
// =========================================================
historyRouter.get('/', async (req, res) => {
    try {
        // 1. 토큰 검증
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ error: 'Unauthorized' });

        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) return res.status(401).json({ error: 'Invalid token' });

        // 2. 페이지네이션 계산 (핵심!)
        // 프론트에서 ?page=2&limit=10 처럼 보냅니다.
        const page = parseInt(req.query.page) || 1; 
        const limit = parseInt(req.query.limit) || 10; 
        
        // Supabase range는 0부터 시작하므로 계산식은 다음과 같습니다.
        // page 1 -> from: 0, to: 9
        // page 2 -> from: 10, to: 19
        const from = (page - 1) * limit;
        const to = from + limit - 1;

        // 3. 데이터 조회 (최적화 버전)
        // 조인 없이 history 테이블만 조회하므로 매우 빠릅니다.
        const { data, error, count } = await supabase
            .from('history')
            .select(`
                id,
                created_at,
                title,   
                summary  
            `, { count: 'exact' }) // 전체 데이터 개수도 같이 세기
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .range(from, to); // 여기서 범위를 자릅니다

        if (error) throw error;

        // 4. 응답 포맷 맞추기
        const formattedList = data.map((item) => {
            // DB에는 문자열("가격, 화면")로 저장되어 있지만, 
            // 프론트엔드는 배열(["가격", "화면"])을 원하므로 변환해줍니다.
            const summaryArray = item.summary ? item.summary.split(', ') : [];

            return {
                id: item.id,
                created_at: item.created_at,
                // 과거 데이터라 title이 없으면 기본값
                title: item.title || '상세 비교 내역', 
                specsSummary: summaryArray 
            };
        });

        // 5. 리스트와 전체 개수를 함께 반환
        res.json({
            list: formattedList,
            totalCount: count || 0
        });

    } catch (error) {
        console.error("History List Error:", error);
        res.status(500).json({ error: 'Failed to fetch history list' });
    }
});

// =========================================================
// [GET] 상세 조회 (기존 유지)
historyRouter.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        // 1. 토큰 인증
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ error: 'Unauthorized' });

        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) return res.status(401).json({ error: 'Invalid token' });

        // 2. 상세 데이터 조회 (기존 로직 유지)
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
            .eq('user_id', user.id)
            .single();

        if (error || !historyItem) {
            return res.status(404).json({ error: 'History not found' });
        }

        // --- 데이터 가공 (기존 코드와 동일) ---
        
        // 카테고리 스펙 정의 가져오기
        const categorySpecs = Array.isArray(historyItem.category) ? historyItem.category[0]?.specs : historyItem.category?.specs;
        const priceSpecDef = { eng_name: 'price', kor_name: '가격', unit: '원', is_positive: false, icon_key: 'price' };
        
        // 'price' 중복 제거 후 병합
        const dbSpecs = (categorySpecs || []).filter(s => s.eng_name.toLowerCase() !== 'price');
        const specDefinitions = [priceSpecDef, ...dbSpecs];

        // 점수 내림차순 정렬
        const scores = historyItem.score || [];
        scores.sort((a, b) => b.score - a.score);

        // 스펙 병합 헬퍼 함수
        const mergeSpecs = (variant) => ({
            price: variant.price,
            ...(variant.product?.common_specs || {}),
            ...(variant.option_specs || {})
        });

        // 랭킹 데이터 생성
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