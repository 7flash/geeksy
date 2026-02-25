const jokes = [
  { id: 1, setup: "Why don't scientists trust atoms?", punchline: "Because they make up everything!" },
  { id: 2, setup: "What do you call a fish with no eyes?", punchline: "Fsh!" },
  { id: 3, setup: "How do you organize a space party?", punchline: "You planet!" },
  { id: 4, setup: "Why did the scarecrow win an award?", punchline: "Because he was outstanding in his field!" },
  { id: 5, setup: "What do you call a boomerang that won't come back?", punchline: "A stick!" }
];

async function getUsedJokes() {
  try {
    const response = await fetch(`${process.env.STATE_URL}/api/agent-state`);
    if (!response.ok) {
      console.error(`Failed to fetch state: ${response.status} ${response.statusText}`);
      return [];
    }
    const state = await response.json();
    return state.usedJokeIds || [];
  } catch (error) {
    console.error('Error fetching state:', error);
    return [];
  }
}

async function updateUsedJokes(usedJokeIds) {
  try {
    const response = await fetch(`${process.env.STATE_URL}/api/agent-state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usedJokeIds })
    });
    if (!response.ok) {
      console.error(`Failed to update state: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.error('Error updating state:', error);
  }
}

async function tellJoke() {
  let usedJokeIds = await getUsedJokes();
  let availableJokes = jokes.filter(joke => !usedJokeIds.includes(joke.id));

  if (availableJokes.length === 0) {
    // All jokes used, reset the list
    console.log("All jokes told! Resetting joke list.");
    usedJokeIds = [];
    availableJokes = jokes;
  }

  const randomIndex = Math.floor(Math.random() * availableJokes.length);
  const selectedJoke = availableJokes[randomIndex];

  console.log(`\n${selectedJoke.setup}\n${selectedJoke.punchline}\n`);

  usedJokeIds.push(selectedJoke.id);
  await updateUsedJokes(usedJokeIds);
}

tellJoke();
