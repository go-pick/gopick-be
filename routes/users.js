import express from 'express';
import { supabase } from '../config/supabaseClient.js';

const userRouter = express.Router();

// userRouter.post('/signup', async (req, res) => {
// 	const { username, email, password } = req.body;
// });

userRouter.get('/check-username', async (req, res) => {
	const { username } = req.query;

	if (!username) {
		return res.status(400).json({error: 'username이 필요합니다.'});
	}

	try {
		const { data, error } = await supabase
			.from('user')
			.select('username')
			.eq('username', username)
			.single();
		
		if (error && error.code !== 'PGRST116') {
			// PGRST116 == '에러 없음' 의미함
			throw error;
		}
		
		if (data) {
			return res.status(200).json({isDuplicate: true}); // 중복됨
		} else {
			return res.status(200).json({isDuplicate: false}); // 중복 없음
		}
	} catch(err) {
		return res.status(500).json({error: '서버오류', details: err.message});
	}
});

export default userRouter;