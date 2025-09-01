import fetch from 'node-fetch';

const url = 'https://api-american-football.p.rapidapi.com/games?date=2022-09-30';
const headers = {
  'X-RapidAPI-Key': '8be9d7d03amsh1d23df267296dfcp1733bajsncde77ef9f87f',
  'X-RapidAPI-Host': 'api-american-football.p.rapidapi.com'
};

fetch(url, { headers })
  .then(res => res.json())
  .then(json => console.log('✅ RESPONSE:', json))
  .catch(err => console.error('❌ ERROR:', err));