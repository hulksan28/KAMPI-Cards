const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');
const { createDeck, evaluateHand } = require('./gameLogic');

app.use(express.static(path.join(__dirname, 'public')));

// Game State
const rooms = {};

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join_game', ({ name, roomId }) => {
        socket.join(roomId);

        if (!rooms[roomId]) {
            rooms[roomId] = {
                players: [],
                deck: [],
                currentTurnIndex: 0,
                pot: 0,
                active: false,
                hostId: socket.id,

                // KAMPI Tracking
                currentBlindStake: 2,
                isSeenMode: false,
                consecutiveSeenRounds: 0, // Strict tracking
                lastBetAmount: 0,
                lastGameWasTrail: false,
                distributeProposal: null
            };
        }

        const room = rooms[roomId];

        // Add player
        const player = {
            id: socket.id,
            name: name,
            hand: [],
            folded: false,
            balance: 100, // Balance 100
            isSeen: false,
            hasCrossed: false // Track cross usage
        };
        room.players.push(player);

        io.to(roomId).emit('player_joined', { players: room.players, newPlayer: player.name });

        if (room.hostId === socket.id && room.players.length >= 2) {
            io.to(room.hostId).emit('can_start', true);
        }
    });

    socket.on('start_game', (roomId) => {
        const room = rooms[roomId];
        if (!room || room.active) return;
        if (room.hostId !== socket.id) return;
        startNewRound(roomId);
    });

    socket.on('see_my_cards', (roomId) => {
        const room = rooms[roomId];
        const player = room.players.find(p => p.id === socket.id);
        if (!room || !player) return;

        if (room.active && !player.folded && !player.isSeen) {
            player.isSeen = true;
            io.to(player.id).emit('your_hand', player.hand);
            io.to(roomId).emit('action_log', `${player.name} has SEEN their cards.`);

            // If table wasn't seen mode, it is now
            if (!room.isSeenMode) {
                room.isSeenMode = true;
            }

            // If I see cards, I break the "consecutive seen rounds" unless everyone else was already seen
            // Actually, consecutiveSeenRounds counts *orbits* where everyone WAS seen. 
            // Turning seen in middle of orbit doesn't increment count immediately, allow logic to handle.

            io.to(roomId).emit('turn_change', {
                id: room.players[room.currentTurnIndex].id,
                pot: room.pot,
                balances: room.players.map(p => ({ id: p.id, balance: p.balance })),
                isSeenMode: room.isSeenMode,
                lastBetAmount: room.lastBetAmount
            });
        }
    });

    socket.on('distribute_proposal', ({ roomId, type }) => {
        handleDistribute(roomId, socket.id, type);
    });

    socket.on('player_action', ({ roomId, action }) => {
        const room = rooms[roomId];
        if (!room || !room.active) return;

        const player = room.players.find(p => p.id === socket.id);
        if (!player || room.players[room.currentTurnIndex].id !== socket.id) return;

        handleAction(roomId, player, action);
    });

    socket.on('disconnect', () => {
        for (const roomId in rooms) {
            const room = rooms[roomId];
            const index = room.players.findIndex(p => p.id === socket.id);
            if (index !== -1) {
                room.players.splice(index, 1);
                io.to(roomId).emit('player_left', room.players);

                if (room.players.length === 0) {
                    delete rooms[roomId];
                } else if (room.hostId === socket.id) {
                    room.hostId = room.players[0].id;
                    io.to(roomId).emit('host_change', room.hostId);
                }
            }
        }
    });
});

function startNewRound(roomId) {
    const room = rooms[roomId];
    room.active = true;
    room.deck = createDeck(room.players.length);
    room.pot = 0;
    room.currentTurnIndex = 0;
    room.isSeenMode = false;
    room.consecutiveSeenRounds = 0;
    room.lastBetAmount = 0;
    room.distributeProposal = null;

    room.minBlindChoice = room.lastGameWasTrail ? 2 : 1;

    room.players.forEach(p => {
        p.hand = [room.deck.pop(), room.deck.pop(), room.deck.pop()];
        p.folded = false;
        p.isSeen = false;
        p.hasCrossed = false; // Reset cross
        p.balance = p.balance || 100; // Reset logic? No, keep balance, just ensure startup was 100

        // Deduct blind
        p.balance -= room.minBlindChoice;
        room.pot += room.minBlindChoice;
    });

    // Set initial lastBetAmount to Blind amount (so next bet must match or exceed)
    room.lastBetAmount = room.minBlindChoice;

    const sanitizedPlayers = room.players.map(p => ({ ...p, hand: [] }));

    io.to(roomId).emit('game_started', {
        players: sanitizedPlayers,
        pot: room.pot,
        currentTurn: room.players[0].id,
        minBlindChoice: room.minBlindChoice
    });
}

function handleAction(roomId, player, action) {
    const room = rooms[roomId];

    if (action.type === 'fold') {
        player.folded = true;
        room.consecutiveSeenRounds = 0; // Reset streak on drop
        io.to(roomId).emit('action_log', `${player.name} FOLDED.`);
    }
    else if (action.type === 'cross') {
        // Cross Logic:
        // 1. Can only cross if previously Blind (not seen).
        // 2. Can only cross if Table is in Seen Mode (someone else seen).
        // 3. One time use.
        if (player.isSeen || player.hasCrossed || !room.isSeenMode) return;

        const cost = room.minBlindChoice; // Paying Blind price
        player.balance -= cost;
        room.pot += cost;

        player.isSeen = true;
        player.hasCrossed = true;

        io.to(player.id).emit('your_hand', player.hand);
        io.to(roomId).emit('action_log', `${player.name} CROSSED (Paid ₹${cost}).`);

        // Cross resets streak? User said "3 Seen rounds of same set of people". 
        // Cross changes 'blind' status to 'seen'. 
    }
    else if (action.type === 'bet') {
        const amount = parseInt(action.amount);

        // Validation
        if (player.isSeen) {
            // Must be >= lastBet
            if (amount < room.lastBetAmount) {
                // But wait, if lastBet was Blind (2), and I am Seen, I must pay 4?
                // "When one keeps Seen at 4, other must keep 4 or more".
                // "When Blind is 2, Seen min is 4".
                // Logic: If I am Seen, minimum bet is Max(lastBet, 2 * room.minBlindChoice).
                // Actually, if lastBet was already high (Seen 10), then minimum is 10.
            }
        } else {
            // I am Blind
            // If Table is Seen Mode -> I CANNOT Bet Blind.
            if (room.isSeenMode) {
                // Error? Client should disable button.
                return;
            }
        }

        player.balance -= amount;
        room.pot += amount;

        const typeLabel = player.isSeen ? 'SEEN' : 'BLIND';
        io.to(roomId).emit('action_log', `${player.name} plays ${typeLabel} ₹${amount}.`);

        // Update last bet logic
        // If increased, reset rounds
        if (amount > room.lastBetAmount) {
            room.lastBetAmount = amount;
            room.consecutiveSeenRounds = 0; // Bet raised, restart count
        }
    }

    // Check 3-Round Tracking
    // We increment counter only if:
    // 1. Everyone active is SEEN.
    // 2. We completed a full orbit? 
    // Simplified: "3 rounds continuously with same amount".
    // We'll track 'turns' and divide by active players.
    // Or just increment `consecutiveSeenRounds` every turn if everyone IsSeen and Bet == LastBet.
    const activePlayers = room.players.filter(p => !p.folded);
    const allSeen = activePlayers.every(p => p.isSeen);

    if (allSeen && !room.consecutiveSeenRounds_Counting) {
        room.consecutiveSeenRounds_Counting = true; // start counting
        room.seenRoundCounter = 0;
    } else if (!allSeen) {
        room.consecutiveSeenRounds_Counting = false;
        room.seenRoundCounter = 0;
    }

    if (room.consecutiveSeenRounds_Counting) {
        room.seenRoundCounter++;
        // If counter >= 3 * activePlayers -> Showdown
        if (room.seenRoundCounter >= (activePlayers.length * 3)) {
            io.to(roomId).emit('action_log', `Limit Reached (3 Rounds Seen): Forced Showdown!`);
            resolveShowdown(roomId);
            return;
        }
    }

    do {
        room.currentTurnIndex = (room.currentTurnIndex + 1) % room.players.length;
    } while (room.players[room.currentTurnIndex].folded);

    const nextPlayer = room.players[room.currentTurnIndex];

    if (room.players.filter(p => !p.folded).length === 1) {
        endRound(roomId, room.players.find(p => !p.folded));
    } else {
        io.to(roomId).emit('turn_change', {
            id: nextPlayer.id,
            pot: room.pot,
            balances: room.players.map(p => ({ id: p.id, balance: p.balance })),
            isSeenMode: room.isSeenMode,
            lastBetAmount: room.lastBetAmount,
            minBlindChoice: room.minBlindChoice,
            canCross: (!nextPlayer.isSeen && !nextPlayer.hasCrossed && room.isSeenMode) // flag for UI
        });
    }
}

function handleDistribute(roomId, playerId, type) {
    const room = rooms[roomId];
    if (!room) return;

    const activePlayers = room.players.filter(p => !p.folded);
    if (activePlayers.length !== 2) return;

    const otherPlayer = activePlayers.find(p => p.id !== playerId);

    if (type === 'propose') {
        room.distributeProposal = { proposer: playerId, proposee: otherPlayer.id };
        io.to(otherPlayer.id).emit('distribute_request', { from: room.players.find(p => p.id === playerId).name });
        io.to(playerId).emit('action_log', "You offered to Distribute.");
    } else if (type === 'accept') {
        if (room.distributeProposal && room.distributeProposal.proposee === playerId) {
            const half = Math.floor(room.pot / 2);
            activePlayers.forEach(p => p.balance += half);
            room.pot = 0;
            room.active = false;
            io.to(roomId).emit('round_end', { winner: 'Split Pot', pot: 0, reason: 'Distribute Accepted' });
        }
    } else {
        room.distributeProposal = null;
        io.to(roomId).emit('action_log', "Distribute proposal rejected.");
    }
}


function resolveShowdown(roomId) {
    const room = rooms[roomId];
    const activePlayers = room.players.filter(p => !p.folded);

    let winner = null;
    let bestHandScore = -1;
    let details = [];

    activePlayers.forEach(p => {
        const result = evaluateHand(p.hand);
        details.push({ name: p.name, hand: p.hand, rank: result.name });
        if (result.score > bestHandScore) {
            bestHandScore = result.score;
            winner = p;
            room.lastGameWasTrail = (result.type === 'TRAIL');
        }
    });

    io.to(roomId).emit('showdown', {
        winner: winner.id,
        hands: activePlayers.map(p => ({ id: p.id, hand: p.hand })),
        details: details
    });

    winner.balance += room.pot;
    room.active = false;

    let msg = `Winner: ${winner.name}!`;
    if (room.lastGameWasTrail) msg += " (TRAIL! Next game stakes double!)";

    setTimeout(() => {
        io.to(roomId).emit('round_end', { winner: winner.name, pot: room.pot, msg });
    }, 5000);
}

function endRound(roomId, winner) {
    const room = rooms[roomId];
    winner.balance += room.pot;
    room.active = false;
    room.lastGameWasTrail = false;
    io.to(roomId).emit('round_end', {
        winner: winner.name,
        pot: room.pot,
        reason: 'All others folded'
    });
}

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
