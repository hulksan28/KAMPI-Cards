const SUITS = ['S', 'H', 'D', 'C'];
const RANKS = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'];
const RANK_VALUES = {
    'A': 14, 'K': 13, 'Q': 12, 'J': 11, '10': 10, '9': 9, '8': 8, '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2
};

function createDeck(numPlayers) {
    const cardsNeeded = numPlayers * 3;
    // Calculate how many ranks we need from the top
    // Each rank has 4 suits. 
    // e.g., 6 players = 18 cards. 18 / 4 = 4.5 -> Need 5 ranks (20 cards).
    const ranksNeeded = Math.ceil(cardsNeeded / 4);

    // Slice ranks from the top (Start of array)
    // Note: RANKS is ordered High to Low.
    const activeRanks = RANKS.slice(0, ranksNeeded);

    let deck = [];
    for (let r of activeRanks) {
        for (let s of SUITS) {
            deck.push({ rank: r, suit: s, value: RANK_VALUES[r] });
        }
    }
    return shuffle(deck);
}

function shuffle(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

// Hand Strength:
// 1. Trail (Three of a kind) - Type Value: 400
// 2. Color (Flush) - Type Value: 300
// 3. Pair - Type Value: 200
// 4. High Card - Type Value: 100

function evaluateHand(hand) {
    // Sort hand by value descending
    hand.sort((a, b) => b.value - a.value);

    const v0 = hand[0].value;
    const v1 = hand[1].value;
    const v2 = hand[2].value;

    const s0 = hand[0].suit;
    const s1 = hand[1].suit;
    const s2 = hand[2].suit;

    // Check Trail
    if (v0 === v1 && v1 === v2) {
        return { type: 'TRAIL', score: 400 + v0, name: 'Trail' };
    }

    // Check Color
    const isFlush = (s0 === s1 && s1 === s2);
    if (isFlush) {
        // High card determines winner in flush
        // value = 300 + (highest card normalized somewhat or just simple comparison later)
        // Actually, simple score: 30000 + v0*100 + v1*10 + v2
        return { type: 'COLOR', score: 30000 + v0 * 100 + v1 * 10 + v2, name: 'Color' };
    }

    // Check Pair
    if (v0 === v1) {
        return { type: 'PAIR', score: 20000 + v0 * 100 + v2, name: 'Pair' }; // Pair of v0, kicker v2
    }
    if (v1 === v2) {
        return { type: 'PAIR', score: 20000 + v1 * 100 + v0, name: 'Pair' }; // Pair of v1, kicker v0
    }

    // High Card
    return { type: 'HIGH_CARD', score: 10000 + v0 * 100 + v1 * 10 + v2, name: 'High Card' };
}

module.exports = { createDeck, evaluateHand };
