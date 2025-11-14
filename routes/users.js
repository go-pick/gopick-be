import express from 'express';
import { supabase } from '../config/supabaseClient.js';

const userRouter = express.Router();

userRouter.post('/signup', async (req, res) => {
	const { username, email, password } = req.body;

	// 기본 유효성 검사
	if (!username || !email || !password) {
		return res.status(400).json({error: '아이디, 비밀번호, 이메일은 필수입니다.'});
	}

	try {
		const { data, error } = await supabase.auth.signUp({
			email: email,
			password: password,
			options: {
				data: {
					username: username
				},
				emailRedirectTo: 'http://localhost:3000/verify-email'
			}
		});

		// supabase error
		if (error) {
			console.error('Supabase signup error :', error.message);
			return res.status(error.status || 400).json({error: error.message});
		}

		// 성공 시
		if (data.user && data.user.identities && data.user.identities.length === 0) {
			return res.status(200).json({ 
				message: '회원가입 요청이 완료되었습니다. 이메일을 확인하여 인증을 완료해 주세요.' 
			});
		}

		return res.status(200).json({message: '회원가입 성공', data: data.user});
	} catch(err) {
		console.error('Server signup error :', err);
		return res.status(500).json({error: '서버 내부 오류가 발생했습니다.'});
	}
});

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

userRouter.post('/login', async (req, res) => {
	const { email, password } = req.body;

	// 유효성 검사
	if (!email || !password) {
		return res.status(400).json({ error: '이메일과 비밀번호는 필수입니다. '});
	}

	try {
		const { data, error } = await supabase.auth.signInWithPassword({
			email: email,
			password: password,
		});

		if (error) {
			console.error('Supabase login error :', error.message);
			return res.status(error.status || 400).json({ error: '이메일 또는 비밀번호가 일치하지 않습니다.'});
		}

		res.status(200).json({
			message: '로그인 성공',
			session: data.session, // access_token, refresh_token 등 포함.
			user: data.user,
		})
	} catch(err) {
		console.error('Server login error : ', err);
		return res.status(500),json({ error: '서버 내부 오류가 발생했습니다.'});
	}
});

userRouter.get('/me', async (req, res) => {
	try {
		const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(400).json({error: "No authorization header"});
        }
        const token = authHeader.split(' ')[1];

        // 1. 이 함수가 토큰 검증과 유저 정보 조회를 모두 처리합니다.
        const { data: {user}, error: authError } = await supabase.auth.getUser(token);
        
        if (authError || !user) {
            return res.status(401).json({ error: 'Invalid token', details: authError?.message });
        }

		const username = user.user_metadata?.username;

        if (!username) {
            return res.status(404).json({ error: 'Username not found in user metadata' });
        }

        // 4. 즉시 응답
        res.json({ username: username });

	} catch(error) {
		console.error("error in /auth/me: ", error.message);
		res.status(500).json({ error: 'Server error' });
	}
});

export default userRouter;