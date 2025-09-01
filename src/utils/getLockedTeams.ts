import axios from 'axios';

export const getLockedTeams = async (): Promise<string[]> => {
  try {
    const response = await axios.get(
      'https://american-football-api.p.rapidapi.com/api/american-football/matches',
      {
        headers: {
          'X-RapidAPI-Key': process.env.RAPIDAPI_KEY as string,
          'X-RapidAPI-Host': 'american-football-api.p.rapidapi.com',
        },
      }
    );

    const now = new Date();
    const locked: Set<string> = new Set();

    for (const game of response.data.data) {
      const gameTime = new Date(game.time.starting_at);
      if (now >= gameTime) {
        locked.add(game.participants[0].name);
        locked.add(game.participants[1].name);
      }
    }

    return Array.from(locked);
  } catch (err) {
    console.error('❌ Error fetching locked teams:', err);
    return [];
  }
};