const STATE_URL = process.env.GEEKSY_STATE_URL || 'http://localhost:4200/state';

async function getState(key: string) {
    const response = await fetch(`${STATE_URL}/${key}`);
    if (!response.ok) {
        return undefined;
    }
    const data = await response.json();
    return data.value;
}

async function setState(key: string, value: any) {
    await fetch(`${STATE_URL}/${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value }),
    });
}

const quotes = [
    "The only way to do great work is to love what you do. - Steve Jobs",
    "Believe you can and you're halfway there. - Theodore Roosevelt",
    "The future belongs to those who believe in the beauty of their dreams. - Eleanor Roosevelt",
    "It always seems impossible until it's done. - Nelson Mandela",
    "Success is not final, failure is not fatal: it is the courage to continue that counts. - Winston Churchill",
    "The best way to predict the future is to create it. - Peter Drucker",
    "Don't watch the clock; do what it does. Keep going. - Sam Levenson",
    "The only limit to our realization of tomorrow will be our doubts of today. - Franklin D. Roosevelt",
    "What you get by achieving your goals is not as important as what you become by achieving your goals. - Zig Ziglar",
    "Go confidently in the direction of your dreams! Live the life you've imagined. - Henry David Thoreau",
    "The mind is everything. What you think you become. - Buddha",
    "Strive not to be a success, but rather to be of value. - Albert Einstein"
];

async function sendQuote() {
    let lastQuoteIndex = (await getState('lastQuoteIndex')) || 0;
    const quote = quotes[lastQuoteIndex];
    console.log(`📋 quote-sender-task\n${quote}`);

    lastQuoteIndex = (lastQuoteIndex + 1) % quotes.length;
    await setState('lastQuoteIndex', lastQuoteIndex);
}

sendQuote();