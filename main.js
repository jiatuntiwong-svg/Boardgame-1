import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, onValue, update } from "firebase/database";

const firebaseConfig = {
    apiKey: "AIzaSyBMoaV77NoBNY3oBqQrmOuyPYyzP97N-ko",
    databaseURL: "https://boardgame-59909-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "boardgame-59909",
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

let myId, gameId, gameData;
let hasDrawn = false;
let currentGuessTarget = null;

async function init() {
    myId = localStorage.getItem("dv_uid") || "p_" + Math.random().toString(36).substr(2, 5);
    localStorage.setItem("dv_uid", myId);
    
    gameId = window.location.hash.substring(1) || "room1";
    if (!window.location.hash) window.location.hash = "room1";
    document.getElementById("share-url").value = window.location.href;

    onValue(ref(db, `games/${gameId}`), (snapshot) => {
        gameData = snapshot.val();
        if (!gameData) {
            setupRoom();
        } else {
            render();
        }
    });
}

function setupRoom() {
    set(ref(db, `games/${gameId}`), {
        state: "LOBBY",
        seats: { 1: null, 2: null, 3: null, 4: null, 5: null, 6: null },
        players: {},
        deck: [],
        turn: null,
        logs: ["รอผู้เข้าแข่งขัน..."]
    });
}

function render() {
    const isMyTurn = gameData.turn === myId;
    document.getElementById("game-status").innerText = isMyTurn ? "🔒 ตาของคุณในการถอดรหัส" : "⏳ รอคู่ต่อสู้ดำเนินการ...";

    if (gameData.state === "LOBBY") {
        document.getElementById("lobby-screen").style.display = "block";
        document.getElementById("game-board").style.display = "none";
        renderLobby();
    } else {
        document.getElementById("lobby-screen").style.display = "none";
        document.getElementById("game-board").style.display = "block";
        renderGame();
    }
}

function renderLobby() {
    const grid = document.getElementById("seat-grid");
    grid.innerHTML = "";
    for (let i = 1; i <= 6; i++) {
        const occupant = gameData.seats[i];
        const btn = document.createElement("button");
        btn.className = `seat-btn ${occupant ? 'taken' : ''}`;
        btn.innerHTML = occupant ? (occupant === myId ? "ที่นั่งของคุณ" : "มีผู้อื่นนั่งแล้ว") : `ที่นั่งว่าง ${i}`;
        if (!occupant) btn.onclick = () => selectSeat(i);
        grid.appendChild(btn);
    }
}

window.selectSeat = (num) => {
    const seats = { ...gameData.seats };
    for (let s in seats) if (seats[s] === myId) seats[s] = null;
    seats[num] = myId;
    update(ref(db, `games/${gameId}`), { seats });
};

window.startGame = () => {
    const activeUids = Object.values(gameData.seats).filter(u => u !== null);
    if (activeUids.length < 2) return alert("ต้องการผู้เล่นอย่างน้อย 2 คน");

    // สร้างไพ่ 0-11 ขาวดำ (อ้างอิง gameLogic.ts)
    let deck = [];
    for (let i = 0; i <= 11; i++) {
        deck.push({ v: i, c: 'black', revealed: false });
        deck.push({ v: i, c: 'white', revealed: false });
    }
    deck.sort(() => Math.random() - 0.5);

    const players = {};
    activeUids.forEach(uid => {
        players[uid] = {
            hand: sortTiles(deck.splice(0, 4)),
            isEliminated: false
        };
    });

    update(ref(db, `games/${gameId}`), {
        state: "PLAYING",
        deck,
        players,
        turn: activeUids[0]
    });
};

function renderGame() {
    // แสดงไพ่เรา
    const myHand = document.getElementById("my-hand");
    myHand.innerHTML = "";
    if (gameData.players[myId]) {
        gameData.players[myId].hand.forEach(t => {
            const d = document.createElement("div");
            d.className = `tile ${t.c} ${t.revealed ? 'revealed' : ''}`;
            d.innerText = t.v;
            myHand.appendChild(d);
        });
    }

    // แสดงไพ่คู่ต่อสู้
    const oppCont = document.getElementById("opponents-container");
    oppCont.innerHTML = "";
    Object.keys(gameData.players).forEach(uid => {
        if (uid === myId) return;
        const p = gameData.players[uid];
        const div = document.createElement("div");
        div.className = "opponent-box";
        div.innerHTML = `<h4>สายลับ ${uid.slice(0,4)}</h4>`;
        const hand = document.createElement("div");
        hand.className = "hand";
        p.hand.forEach((t, i) => {
            const d = document.createElement("div");
            d.className = `tile ${t.c} ${t.revealed ? 'revealed' : 'hidden'}`;
            d.innerText = t.revealed ? t.v : "?";
            if (gameData.turn === myId && hasDrawn && !t.revealed) {
                d.onclick = () => openGuessModal(uid, i);
            }
            hand.appendChild(d);
        });
        div.appendChild(hand);
        oppCont.appendChild(div);
    });

    document.getElementById("deck-count").innerText = gameData.deck.length;
    document.getElementById("draw-btn").style.display = (gameData.turn === myId && !hasDrawn) ? "block" : "none";
}

window.drawTile = () => {
    if (gameData.deck.length === 0) { hasDrawn = true; render(); return; }
    const deck = [...gameData.deck];
    const tile = deck.pop();
    tile.isNew = true; // มาร์คว่าเป็นใบใหม่
    const hand = sortTiles([...gameData.players[myId].hand, tile]);
    
    hasDrawn = true;
    const updates = {};
    updates[`games/${gameId}/deck`] = deck;
    updates[`games/${gameId}/players/${myId}/hand`] = hand;
    update(ref(db), updates);
};

function openGuessModal(uid, idx) {
    currentGuessTarget = { uid, idx };
    document.getElementById("guess-modal").style.display = "flex";
    const grid = document.querySelector(".guess-grid");
    grid.innerHTML = "";
    for (let i = 0; i <= 11; i++) {
        const b = document.createElement("button");
        b.className = "action-btn";
        b.innerText = i;
        b.onclick = () => submitGuess(i);
        grid.appendChild(b);
    }
}

function submitGuess(num) {
    const { uid, idx } = currentGuessTarget;
    const targetHand = [...gameData.players[uid].hand];
    const isCorrect = targetHand[idx].v === num;

    if (isCorrect) {
        alert("ถอดรหัสสำเร็จ!");
        targetHand[idx].revealed = true;
        const updates = {};
        updates[`games/${gameId}/players/${uid}/hand`] = targetHand;
        update(ref(db), updates);
        document.getElementById("end-turn-btn").style.display = "block";
    } else {
        alert("พลาด! รหัสของคุณจะถูกเปิดเผย");
        revealMyTile();
        window.endTurn();
    }
    window.closeGuessModal();
}

function revealMyTile() {
    const myHand = [...gameData.players[myId].hand];
    const hidden = myHand.filter(t => !t.revealed);
    if (hidden.length > 0) {
        // ในกติกาจริง ใบที่เพิ่งจั่วมาต้องถูกเปิดถ้าทายผิด
        const newTile = myHand.find(t => t.isNew);
        if (newTile) newTile.revealed = true;
        else hidden[0].revealed = true;
        
        myHand.forEach(t => delete t.isNew);
        update(ref(db, `games/${gameId}/players/${myId}`), { hand: myHand });
    }
}

window.endTurn = () => {
    hasDrawn = false;
    document.getElementById("end-turn-btn").style.display = "none";
    const pids = Object.keys(gameData.players);
    const nextIdx = (pids.indexOf(gameData.turn) + 1) % pids.length;
    update(ref(db, `games/${gameId}`), { turn: pids[nextIdx] });
};

window.closeGuessModal = () => document.getElementById("guess-modal").style.display = "none";

function sortTiles(tiles) {
    return tiles.sort((a, b) => (a.v === b.v) ? (a.c === 'black' ? -1 : 1) : a.v - b.v);
}

init();
