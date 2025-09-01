import { Router } from 'express';
import { supabaseAdmin as supabase } from '../supa';
import dotenv from 'dotenv';
dotenv.config();

const router = Router();


router.post('/create', async (req, res) => {
    console.log('🔥 /api/users/create HIT');
  
    const { name } = req.body;
    console.log('Incoming body:', { name });
  
    if (!name) {
      return res.status(400).json({ error: 'Missing name' });
    }
  
    const { data, error } = await supabase
      .from('users')
      .insert([{ name }]) // no id
      .select();
  
    console.log('Supabase response:', { data, error });
  
    if (error) {
      return res.status(500).json({ error: error.message });
    }
  
    res.json({ message: 'User created', user: data?.[0] });
  });

// Get all users (debug/test route)
router.get('/all', async (_req, res) => {
    const { data, error } = await supabase.from('users').select('*');
  
    if (error) {
      console.error('🔴 Supabase error fetching users:', error.message);
      return res.status(500).json({ error: error.message });
    }
  
    res.status(200).json({ users: data });
  });

export default router;