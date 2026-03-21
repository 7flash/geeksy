const quotes = [
  "The only way to do great work is to love what you do.",
  "Believe you can and you're halfway there.",
  "The future belongs to those who believe in the beauty of their dreams.",
  "It always seems impossible until it's done.",
  "Success is not final, failure is not fatal: it is the courage to continue that counts."
];

const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];

console.log(randomQuote);