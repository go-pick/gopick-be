import express from 'express';
import { supabase } from '../config/supabaseClient.js';

const productRouter = express.Router();

productRouter.get('/search', async (req, res) => {
	try {
        const { q, category } = req.query;
        // 1. Product 테이블 조회 (Maker 정보 Join)
        let queryBuilder = supabase
            .from('product') 
            .select(`
                id,
                name,
                image_url,
                common_specs,
                maker:maker_id ( name ), 
                category:category_id!inner ( slug )
            `);

        // 2. 카테고리 필터링 (category 테이블의 slug 이용)
        if (category) {
            queryBuilder = queryBuilder.eq('category.slug', category);
        }

        // 3. 이름 검색
        if (q) {
            queryBuilder = queryBuilder.ilike('name', `%${q}%`);
        }

        const { data, error } = await queryBuilder;
        if (error) throw error;

        // 프론트엔드 전달 포맷
        const formattedData = data.map(p => ({
            id: p.id,
            name: p.name,
            brand: p.maker?.name || 'Unknown',
            image_url: p.image_url,
            specs: p.common_specs || {}
        }));

        res.json(formattedData);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Search failed' });
    }
});

productRouter.get('/:productId/variants', async (req, res) => {
	try {
        const { productId } = req.params;

        // product_varients 테이블 조회 (ERD 스펠링 반영: varients)
        const { data, error } = await supabase
            .from('product_variants')
            .select('id, variant_name, price, option_specs')
            .eq('product_id', productId)
            .order('price', { ascending: true }); // 가격순 정렬

        if (error) throw error;

        res.json(data);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Fetch variants failed' });
    }
});

productRouter.post('/calculate', async (req, res) => {
    try {
        console.log("--------------- [BE] 계산 요청 시작 ---------------");
        
        // 1. 헤더에서 토큰 추출 & 바디 데이터 확인
        const authHeader = req.headers.authorization;
        const token = authHeader?.split(' ')[1];
        console.log("[BE] Token 존재 여부:", !!token);

        const { selectedVariantIds, weights, categoryId } = req.body;

        if (!selectedVariantIds || selectedVariantIds.length < 2) {
            return res.status(400).json({ error: '최소 2개 이상의 제품이 필요합니다.' });
        }

        // =========================================================
        // [STEP 1] 데이터 조회 (Products & Variants & Category)
        // =========================================================
        const { data: variants, error } = await supabase
            .from('product_variants')
            .select(`
                *,
                product:product_id ( 
                    id, name, image_url, common_specs,
                    maker:maker_id ( name )  
                )
            `)
            .in('id', selectedVariantIds);

        if (error) throw error;

        const { data: categoryData, error: catError } = await supabase
            .from('category')
            .select('specs')
            .eq('id', categoryId)
            .single();
            
        if (catError) throw catError;

        // =========================================================
        // [STEP 2] 스펙 리스트 정제 (가격 중복 방지 강화)
        // =========================================================
        
        // 1. 우리가 사용할 표준 '가격' 정의
        const priceSpecDef = {
            eng_name: 'price', kor_name: '가격', unit: '원', is_positive: false, icon_key: 'price'
        };

        // 2. DB에서 가져온 스펙 중 'price' (대소문자 무시)가 있다면 확실히 제거
        const dbSpecs = (categoryData.specs || []).filter(s => 
            s.eng_name.toLowerCase() !== 'price'
        );

        // 3. 합치기 (가격 + 나머지 스펙) -> 이제 '가격'은 맨 앞에 딱 1개만 존재함
        const specDefinitions = [priceSpecDef, ...dbSpecs];


        // 헬퍼 함수들
        const mergeSpecs = (variant) => ({
            price: variant.price,
            ...(variant.product?.common_specs || {}), 
            ...(variant.option_specs || {})          
        });

        const getNumericValue = (key, mergedSpecs) => {
            const val = mergedSpecs[key];
            if (key === 'screen_resolution' && val && typeof val === 'object') {
                return (Number(val.width) || 0) * (Number(val.height) || 0);
            }
            return Number(val || 0);
        };

        // =========================================================
        // [STEP 3] 통계치(Min/Max) 계산
        // =========================================================
        const stats = {};
        specDefinitions.forEach(spec => {
            const key = spec.eng_name;
            const values = variants.map(v => getNumericValue(key, mergeSpecs(v)));
            
            // 값이 하나도 없거나 0인 경우 방어
            stats[key] = { 
                min: values.length ? Math.min(...values) : 0, 
                max: values.length ? Math.max(...values) : 0 
            };
        });

        // =========================================================
        // [STEP 4] 점수 계산 (calculated 변수 생성) -> ★ 가장 중요! 먼저 해야 함
        // =========================================================
        const calculated = variants.map(variant => {
            let totalScore = 0;   
            let totalWeight = 0;  
            const productSpecs = mergeSpecs(variant);

            Object.keys(weights).forEach(key => {
                const userWeight = Number(weights[key]); 
                const val = getNumericValue(key, productSpecs);
                
                if (userWeight === 0) return;

                const specDef = specDefinitions.find(s => s.eng_name === key);
                // 스펙 정의가 없으면(예외) 기본값 처리
                const isPositive = specDef ? specDef.is_positive : true;
                
                const stat = stats[key] || { min: 0, max: 1 };
                const { min, max } = stat;

                let normalizedScore = 0;
                const EPSILON = 0.00001; 

                if (max !== min) {
                    if (isPositive) {
                        if (max > 0) normalizedScore = val / max;
                    } else {
                        if (val > EPSILON) normalizedScore = min / val;
                        else normalizedScore = 1; 
                    }
                } else {
                    normalizedScore = 1; 
                }

                normalizedScore = Math.min(Math.max(normalizedScore, 0), 1);
                totalScore += normalizedScore * userWeight;
                totalWeight += userWeight;
            });

            const finalScore = totalWeight > 0 
                ? Math.round((totalScore / totalWeight) * 100) 
                : 0;
            
            return {
                unique_id: variant.id,
                name: variant.product.name,
                variant_name: variant.variant_name,
                brand: variant.product?.maker?.name || 'Unknown',
                image_url: variant.product.image_url,
                price: variant.price,
                score: finalScore,
                specs: productSpecs 
            };
        });

        // 정렬
        calculated.sort((a, b) => b.score - a.score);


        // =========================================================
        // [STEP 5] DB 저장 (제목과 요약 생성 로직 추가)
        // =========================================================
        if (token) {
            console.log("[BE] DB 저장 로직 진입...");
            const { data: { user }, error: authError } = await supabase.auth.getUser(token);

            if (user && !authError) {
                
                // --- [NEW] 1. 제목(Title) 생성 로직 ---
                // calculated는 이미 점수 순으로 정렬되어 있으므로 0번째가 1등입니다.
                const winnerName = calculated[0]?.name || '제품';
                const count = calculated.length;
                // 예: "Galaxy S24 외 2개 비교" 또는 "iPhone 15 비교"
                const generatedTitle = count > 1 
                    ? `${winnerName} 외 ${count - 1}개 비교` 
                    : `${winnerName} 비교`;

                // --- [NEW] 2. 요약(Summary) 생성 로직 ---
                // 가중치가 0보다 큰 항목들의 한글 이름만 뽑아서 콤마로 연결
                const generatedSummary = Object.entries(weights)
                    .filter(([key, val]) => val > 0) // 가중치 있는 것만
                    .map(([key]) => {
                        const spec = specDefinitions.find(s => s.eng_name === key);
                        return spec ? spec.kor_name : null;
                    })
                    .filter(Boolean) // null값 제거
                    .join(', '); // 예: "가격, 화면크기, 배터리"

                // --- 3. History 생성 (title, summary 포함) ---
                const { data: historyData, error: historyError } = await supabase
                    .from('history')
                    .insert({
                        user_id: user.id,
                        category_id: categoryId,
                        preference: weights,
                        title: generatedTitle,    // <--- 추가됨!
                        summary: generatedSummary // <--- 추가됨!
                    })
                    .select()
                    .single();

                if (!historyError && historyData) {
                    // Score 저장 (기존 로직 동일)
                    const scoreInserts = calculated.map((item) => ({
                        history_id: historyData.id,
                        variant_id: item.unique_id, 
                        score: item.score
                    }));

                    const { error: scoreError } = await supabase
                        .from('score')
                        .insert(scoreInserts);

                    if (scoreError) console.error("[BE] Score 저장 실패:", scoreError);
                    else console.log(`[BE] DB 저장 완료 (ID: ${historyData.id})`);
                } else {
                    console.error("[BE] History 생성 실패:", historyError);
                }
            } else {
                console.error("[BE] 유저 인증 실패 (Token invalid)");
            }
        } else {
            console.log("[BE] 토큰 없음 - 비로그인 상태로 간주하고 저장 건너뜀");
        }

        // =========================================================
        // [STEP 6] 응답 전송
        // =========================================================
        res.json({
            rankedData: calculated,
            specDefinitions: specDefinitions 
        });

    } catch (error) {
        console.error("[BE] 💥 서버 내부 오류:", error);
        res.status(500).json({ error: 'Calculation failed' });
    }
});

export default productRouter;