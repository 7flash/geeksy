const STATE_URL = 'http://localhost:3737/api/state';

async function getState(key: string, defaultValue: any) {
  try {
    const response = await fetch(`${STATE_URL}?key=${key}`);
    if (response.ok) {
      const state = await response.json();
      return state.value !== undefined ? state.value : defaultValue;
    }
  } catch (error) {
    console.error(`Error getting state for ${key}:`, error);
  }
  return defaultValue;
}

async function setState(key: string, value: any) {
  try {
    await fetch(STATE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value }),
    });
  } catch (error) {
    console.error(`Error setting state for ${key}:`, error);
  }
}

const quotes = [
  "The only way to do great work is to love what you do. - Steve Jobs",
  "Believe you can and you're halfway there. - Theodore Roosevelt",
  "The future belongs to those who believe in the beauty of their dreams. - Eleanor Roosevelt",
  "It always seems impossible until it's done. - Nelson Mandela",
  "Success is not final, failure is not fatal: It is the courage to continue that counts. - Winston Churchill",
  "The best way to predict the future is to create it. - Peter Drucker",
  "Don't watch the clock; do what it does. Keep going. - Sam Levenson",
  "The only limit to our realization of tomorrow will be our doubts of today. - Franklin D. Roosevelt",
  "The harder the conflict, the more glorious the triumph. - Thomas Paine",
  "Go confidently in the direction of your dreams! Live the life you've imagined. - Henry David Thoreau",
  "What you get by achieving your goals is not as important as what you become by achieving your goals. - Zig Ziglar",
  "The mind is everything. What you think you become. - Buddha"
];

async function sendQuote() {
  let lastQuoteIndex = await getState('lastQuoteIndex', -1);
  lastQuoteIndex = (lastQuoteIndex + 1) % quotes.length;
  const quote = quotes[lastQuoteIndex];
  console.log(quote);
  await setState('lastQuoteIndex', lastQuoteIndex);
}

sendQuote();
