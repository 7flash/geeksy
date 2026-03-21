const STATE_URL = 'http://localhost:3737/api/state'

async function getState(key: string) {
    const res = await fetch(`${STATE_URL}/${key}`)
    if (res.status === 404) return undefined
    if (!res.ok) throw new Error(`Failed to get state for ${key}: ${res.statusText}`)
    return res.json()
}

async function setState(key: string, value: any) {
    const res = await fetch(`${STATE_URL}/${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(value),
    })
    if (!res.ok) throw new Error(`Failed to set state for ${key}: ${res.statusText}`)
    return res.json()
}

const jokes = [
    "Why don't scientists trust atoms? Because they make up everything!",
    "What do you call a fish with no eyes? Fsh!",
    "How do you organize a space party? You planet!",
    "What do you call a boomerang that won't come back? A stick!",
    "Why did the scarecrow win an award? Because he was outstanding in his field!"
];

async function sendJoke() {
    let jokeIndex = await getState('currentJokeIndex');
    if (jokeIndex === undefined || jokeIndex >= jokes.length) {
        jokeIndex = 0;
        console.log("All jokes told! Resetting joke list.");
    }
    console.log(jokes[jokeIndex]);
    await setState('currentJokeIndex', jokeIndex + 1);
}

sendJoke();
