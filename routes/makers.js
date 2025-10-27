import express from 'express';
import { supabase } from '../config/supabaseClient.js';

const makerRouter = express.Router();

// GET /makers - 모든 제조사 조회
makerRouter.get('/', async (req, res) => {
	const { data, error } = await supabase
		.from('maker')
		.select('*')
	;

	if (error) {
		return res.status(500).json({ error: error.message });
	}

	res.status(200).json(data);
});

// GET /makers/:id - id로 제조사 조회
makerRouter.get('/:id', async (req, res) => {
	const { id } = req.params;

	const { data, error } = await supabase
		.from('maker')
		.select('*')
		.eq('id', id)
		.single()
	;

	if (error) {
		return res.status(500).json({ error: error.messager });
	}
	if (!data) {
		return res.status(404).json({ error: 'Maker not found' });
	}

	res.status(200).json(data);
});

export default makerRouter;