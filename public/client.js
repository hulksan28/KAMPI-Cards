const socket = io();

// UI Elements
const lobbyDiv = document.getElementById('lobby');
const gameDiv = document.getElementById('game-table');
const joinBtn = document.getElementById('join-btn');
const startBtn = document.getElementById('start-btn');
const rulesBtn = document.getElementById('rules-btn'); // NEW
const usernameInput = document.getElementById('username');
const roomIdInput = document.getElementById('room-id');
const playersContainer = document.getElementById('players-container');
const myHandDiv = document.getElementById('my-hand');
const controlsPanel = document.getElementById('controls-panel');
const logDiv = document.getElementById('game-log');
const potDisplay = document.getElementById('central-pot');
const headerInfo = document.getElementById('header-info');
const myBalanceSpan = document.getElementById('my-balance');
const myStatusSpan = document.getElementById('my-status');
const dashboardList = document.getElementById('dashboard-list');

const betAmountInput = document.getElementById('bet-amount');
const betBtn = document.getElementById('bet-btn');
const foldBtn = document.getElementById('fold-btn');
const showBtn = document.getElementById('show-btn'); // Old show button, likely hide or reuse
const displayCardsBtn = document.getElementById('display-cards-btn'); // NEW
const seeCardsBtn = document.getElementById('see-cards-btn');
const crossBtn = document.getElementById('cross-btn');
const distributeBtn = document.getElementById('distribute-btn');

const distributeModal = document.getElementById('distribute-modal');
const rulesModal = document.getElementById('rules-modal'); // NEW
const rulesClose = document.getElementById('rules-close'); // NEW

let myId = null;
let currentRoomId = null;
let amIHost = false;
let myState = {
    isSeen: false,
    folded: false,
    balance: 0
};
let gameState = {
    isSeenMode: false,
    minBlindChoice: 1,
    lastBetAmount: 0,
    canCross: false,
    isHeadsUp: false
};

joinBtn.addEventListener('click', () => {
    const name = usernameInput.value;
    const roomId = roomIdInput.value || 'default';
    if (!name) return alert('Enter a name!');

    currentRoomId = roomId;
    socket.emit('join_game', { name, roomId });
    lobbyDiv.classList.add('hidden');
    gameDiv.classList.remove('hidden');
});

startBtn.addEventListener('click', () => {
    if (amIHost) socket.emit('start_game', currentRoomId);
});

// Rules Modal
rulesBtn.addEventListener('click', () => { rulesModal.classList.remove('hidden'); });
rulesClose.addEventListener('click', () => { rulesModal.classList.add('hidden'); });


socket.on('connect', () => { myId = socket.id; });

socket.on('player_joined', (data) => {
    let players = data.players || data;
    let newcomer = data.newPlayer || "A player";
    renderPlayers(players);
    renderDashboard(players);
    if (newcomer) log(`${newcomer} has joined.`);
    if (players.length > 0 && players[0].id === myId) {
        amIHost = true;
        startBtn.style.display = 'inline-block';
        if (players.length >= 2) {
            startBtn.disabled = false;
            startBtn.innerText = "Start Game";
            headerInfo.innerText = "Ready";
        } else {
            startBtn.disabled = true;
            headerInfo.innerText = "Waiting...";
        }
    } else {
        amIHost = false;
        startBtn.style.display = 'none';
        headerInfo.innerText = "Waiting for Host...";
    }
});

socket.on('host_change', (newHostId) => {
    if (newHostId === myId) {
        log("You are now the HOST.");
        amIHost = true;
        startBtn.style.display = 'inline-block';
        startBtn.disabled = false;
        startBtn.innerText = "Start Game";
    }
});

socket.on('game_started', (data) => {
    log(`--- NEW ROUND (Min Blind: ₹${data.minBlindChoice}) ---`);
    gameState.isSeenMode = false;
    gameState.minBlindChoice = data.minBlindChoice;
    gameState.lastBetAmount = data.minBlindChoice;

    myState.isSeen = false;
    myState.folded = false;
    updateMyStatus();

    myHandDiv.innerHTML = `
        <div class="card-placeholder">?</div>
        <div class="card-placeholder">?</div>
        <div class="card-placeholder">?</div>
    `;

    seeCardsBtn.classList.remove('hidden');
    crossBtn.classList.add('hidden');
    distributeBtn.classList.add('hidden');
    displayCardsBtn.classList.add('hidden');

    betAmountInput.value = data.minBlindChoice;

    if (amIHost) {
        startBtn.disabled = true;
        startBtn.innerText = "Game Active";
    }

    renderPlayers(data.players);
    renderDashboard(data.players);
    updatePot(data.pot);
    handleTurn(data.currentTurn);
});

socket.on('your_hand', (hand) => {
    myState.isSeen = true;
    updateMyStatus();
    myHandDiv.innerHTML = '';
    hand.forEach(card => myHandDiv.appendChild(createCardElement(card)));
    seeCardsBtn.classList.add('hidden');
    log("Cards revealed.");
});

socket.on('turn_change', (data) => {
    gameState.isSeenMode = data.isSeenMode;
    gameState.lastBetAmount = data.lastBetAmount;
    gameState.canCross = data.canCross;
    gameState.isHeadsUp = data.isHeadsUp;

    updatePot(data.pot);

    data.balances.forEach(b => {
        const dItem = document.querySelector(`#dash-p-${b.id} .dash-bal`);
        if (dItem) dItem.innerText = `₹${b.balance}`;
        const pElem = document.getElementById(`p-${b.id}`);
        if (pElem) pElem.querySelector('.balance').innerText = `₹${b.balance}`;
        if (b.id === myId) {
            myState.balance = b.balance;
            myBalanceSpan.innerText = `Bal: ₹${b.balance}`;
        }
    });

    handleTurn(data.id);
});

socket.on('player_left', (players) => {
    renderPlayers(players);
    renderDashboard(players);
    log("A player left.");
});

socket.on('action_log', (msg) => log(msg));

socket.on('showdown', (data) => {
    data.hands.forEach(item => {
        if (item.id !== myId) {
            const pHandDiv = document.querySelector(`#p-${item.id} .player-cards`);
            if (pHandDiv) {
                pHandDiv.innerHTML = '';
                item.hand.forEach(c => {
                    const el = createCardElement(c);
                    el.style.width = '30px'; el.style.height = '45px';
                    el.style.fontSize = '0.8rem';
                    pHandDiv.appendChild(el);
                });
            }
        }
    });
    log(`SHOWDOWN! Winner ID: ${data.winner}`);
});

socket.on('round_end', (data) => {
    log(`Round Over. Winner: ${data.winner}.`);
    if (data.msg) log(data.msg);
    potDisplay.innerText = `Pot: ₹0`;
    controlsPanel.classList.add('disabled');

    setTimeout(() => {
        if (amIHost) {
            startBtn.disabled = false;
            startBtn.innerText = "Start Next Round";
        }
    }, 2000);
});

socket.on('distribute_request', (data) => {
    document.getElementById('distribute-msg').innerText = `${data.from} proposes Distribute. Agree?`;
    distributeModal.classList.remove('hidden');
});

document.getElementById('accept-distribute').addEventListener('click', () => {
    socket.emit('distribute_proposal', { roomId: currentRoomId, type: 'accept' });
    distributeModal.classList.add('hidden');
});
document.getElementById('reject-distribute').addEventListener('click', () => {
    socket.emit('distribute_proposal', { roomId: currentRoomId, type: 'reject' });
    distributeModal.classList.add('hidden');
});


betBtn.addEventListener('click', () => {
    const val = parseInt(betAmountInput.value);
    if (myState.isSeen && val < gameState.lastBetAmount) {
        return alert(`Seen players must bet at least ₹${gameState.lastBetAmount}.`);
    }
    socket.emit('player_action', { roomId: currentRoomId, action: { type: 'bet', amount: val } });
});

foldBtn.addEventListener('click', () => {
    socket.emit('player_action', { roomId: currentRoomId, action: { type: 'fold' } });
});

displayCardsBtn.addEventListener('click', () => {
    // Heads Up Show Logic
    socket.emit('player_action', { roomId: currentRoomId, action: { type: 'display_cards' } });
});

seeCardsBtn.addEventListener('click', () => {
    socket.emit('see_my_cards', currentRoomId);
});

crossBtn.addEventListener('click', () => {
    socket.emit('player_action', { roomId: currentRoomId, action: { type: 'cross', amount: gameState.minBlindChoice } });
});

distributeBtn.addEventListener('click', () => {
    socket.emit('distribute_proposal', { roomId: currentRoomId, type: 'propose' });
});


// Helpers
function handleTurn(activeId) {
    if (activeId === myId) {
        controlsPanel.classList.remove('disabled');
        log("👉 YOUR TURN");

        // Button Name & State
        if (myState.isSeen) {
            betBtn.innerText = "SEEN";
            betBtn.disabled = false;
            const min = Math.max(gameState.lastBetAmount, gameState.minBlindChoice * 2);
            if (betAmountInput.value < min) betAmountInput.value = min;
        } else {
            betBtn.innerText = "BLIND";
            if (gameState.isSeenMode) {
                betBtn.disabled = true;
                betBtn.innerText = "LOCKED";
            } else {
                betBtn.disabled = false;
            }
        }

        // Specific Heads Up Controls
        if (gameState.isHeadsUp) {
            crossBtn.classList.add('hidden'); // No cross in heads up (ruled out by auto-see)
            distributeBtn.classList.add('hidden'); // Optional: Distribute or Display? User said Distribute is for 2 players. Retaining both?
            // "Display your cards" option enabled only when 2 players left
            displayCardsBtn.classList.remove('hidden');
            distributeBtn.classList.remove('hidden'); // Keep distribute as optional split
        } else {
            displayCardsBtn.classList.add('hidden');
            distributeBtn.classList.add('hidden');

            if (gameState.canCross) crossBtn.classList.remove('hidden');
            else crossBtn.classList.add('hidden');
        }

    } else {
        controlsPanel.classList.add('disabled');
        document.querySelectorAll('.player-seat').forEach(el => el.classList.remove('active-turn'));
        const pEl = document.getElementById(`p-${activeId}`);
        if (pEl) pEl.classList.add('active-turn');
    }
}

function renderPlayers(players) {
    playersContainer.innerHTML = '';
    players.forEach(p => {
        if (p.id === myId) {
            myState.balance = p.balance;
            myBalanceSpan.innerText = `Bal: ₹${p.balance}`;
            return;
        }

        const pDiv = document.createElement('div');
        pDiv.id = `p-${p.id}`;
        pDiv.className = `player-seat ${p.folded ? 'folded' : ''}`;
        pDiv.innerHTML = `
            <div class="avatar">${p.name.charAt(0).toUpperCase()}</div>
            <div class="name">${p.name}</div>
            <div class="balance">₹${p.balance}</div>
            <div class="player-cards"></div>
            ${p.isSeen ? '<span class="status-badge">SEEN</span>' : ''}
        `;
        playersContainer.appendChild(pDiv);
    });
}

function renderDashboard(players) {
    dashboardList.innerHTML = '';
    if (!players) return;
    players.forEach(p => {
        const li = document.createElement('li');
        li.id = `dash-p-${p.id}`;
        li.innerHTML = `
            <span class="dash-name">${p.name} ${p.id === myId ? '(You)' : ''}</span>
            <span class="dash-bal">₹${p.balance}</span>
        `;
        dashboardList.appendChild(li);
    });
}

function updatePot(amount) {
    potDisplay.innerText = `Pot: ₹${amount}`;
}

function createCardElement(card) {
    const el = document.createElement('div');
    el.className = `card ${card.suit}`;
    const suitSymbols = { 'S': '♠', 'H': '♥', 'D': '♦', 'C': '♣' };
    el.innerHTML = `
        <span class="rank">${card.rank}</span>
        <span class="suit">${suitSymbols[card.suit]}</span>
    `;
    return el;
}

function log(msg) {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const line = document.createElement('div');
    line.innerHTML = `<span style="color:#aaa">[${time}]</span> ${msg}`;
    logDiv.appendChild(line);
    logDiv.scrollTop = logDiv.scrollHeight;
}

function updateMyStatus() {
    myStatusSpan.innerText = myState.isSeen ? 'SEEN' : 'BLIND';
    if (myState.isSeen) myStatusSpan.style.color = '#e74c3c';
    else myStatusSpan.style.color = '#3498db';
}
