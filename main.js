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
    // กำหนดตัวตนผู้เล่น
    myId = localStorage.getItem("dv_uid") || "p_" + Math.random().toString(36).substr(2, 5);
    localStorage.setItem("dv_uid", myId);
    
    // กำหนดห้องเกม
    gameId = window.location.hash.substring(1) || "room1";
    if (!window.location.hash) window.location.hash = "room1";
    document.getElementById("share-url").value = window.location.href;

    // ฟังการเปลี่ยนแปลงข้อมูลจาก Firebase
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
        maxPlayers: 2, // ค่าเริ่มต้น
        seats: { 1: null, 2: null, 3: null, 4: null, 5: null, 6: null },
        players: {},
        deck: [],
        turn: null,
        logs: ["ยินดีต้อนรับสู่ห้องลับดาวินชี..."]
    });
}

function render() {
    if (!gameData) return;

    const isMyTurn = gameData.turn === myId;
    const statusEl = document.getElementById("game-status");
    statusEl.innerText = isMyTurn ? "🔒 ตาของคุณ: โปรดวิเคราะห์รหัส" : "⏳ รอสายลับท่านอื่นดำเนินการ...";
    if (isMyTurn) statusEl.classList.add("my-turn");
    else statusEl.classList.remove("my-turn");

    if (gameData.state === "LOBBY") {
        document.getElementById("lobby-screen").style.display = "flex";
        document.getElementById("game-board").style.display = "none";
        renderLobby();
    } else {
        document.getElementById("lobby-screen").style.display = "none";
        document.getElementById("game-board").style.display = "block";
        renderGame();
    }
}

function renderLobby() {
    // แสดงตัวเลือกจำนวนผู้เล่นสูงสุด (เฉพาะคนแรกที่เข้าห้อง หรือระบบ Admin ง่ายๆ)
    const settingsArea = document.getElementById("lobby-settings");
    settingsArea.innerHTML = `
        <label>จำนวนผู้เล่นสูงสุดในรอบนี้:</label>
        <select onchange="window.updateMaxPlayers(this.value)">
            ${[2,3,4,5,6].map(n => `<option value="${n}" ${gameData.maxPlayers == n ? 'selected' : ''}>${n} ท่าน</option>`).join('')}
        </select>
    `;

    const grid = document.getElementById("seat-grid");
    grid.innerHTML = "";
    for (let i = 1; i <= gameData.maxPlayers; i++) {
        const occupant = gameData.seats[i];
        const btn = document.createElement("button");
        btn.className = `seat-card ${occupant ? 'occupied' : 'vacant'} ${occupant === myId ? 'is-me' : ''}`;
        
        btn.innerHTML = `
            <div class="seat-number">ที่นั่ง ${i}</div>
            <div class="occupant-name">${occupant ? (occupant === myId ? "คุณ (สายลับ)" : "สายลับท่านอื่น") : "ว่าง"}</div>
        `;
        
        if (!occupant) btn.onclick = () => selectSeat(i);
        grid.appendChild(btn);
    }
}

window.updateMaxPlayers = (val) => {
    update(ref(db, `games/${gameId}`), { maxPlayers: parseInt(val) });
};

window.selectSeat = (num) => {
    const seats = { ...gameData.seats };
    // ลุกจากที่นั่งเดิม
    for (let s in seats) if (seats[s] === myId) seats[s] = null;
    // นั่งที่ใหม่
    seats[num] = myId;
    update(ref(db, `games/${gameId}`), { seats });
};

window.startGame = () => {
    const activeUids = Object.values(gameData.seats).filter(u => u !== null);
    if (activeUids.length < 2) return alert("ต้องการผู้เล่นอย่างน้อย 2 คนเพื่อเริ่มการถอดรหัส");

    // สร้างสำรับไพ่ 0-11 ขาวดำ
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
    // แสดงไพ่ของเราเอง (เห็นเลขทั้งหมด)
    const myHand = document.getElementById("my-hand");
    myHand.innerHTML = "";
    if (gameData.players[myId]) {
        gameData.players[myId].hand.forEach(t => {
            const d = document.createElement("div");
            d.className = `tile ${t.c} ${t.revealed ? 'revealed' : ''}`;
            d.innerHTML = `<span class="tile-value">${t.v}</span>`;
            myHand.appendChild(d);
        });
    }

    // แสดงไพ่คู่ต่อสู้ (เห็นเฉพาะใบที่ถูกเปิดเผย)
    const oppCont = document.getElementById("opponents-container");
    oppCont.innerHTML = "";
    Object.keys(gameData.players).forEach(uid => {
        if (uid === myId) return;
        const p = gameData.players[uid];
        const div = document.createElement("div");
        div.className = "opponent-section";
        div.innerHTML = `<div class="opponent-header">สายลับ: ${uid.slice(0, 5)}</div>`;
        
        const hand = document.createElement("div");
        hand.className = "hand mini";
        p.hand.forEach((t, i) => {
            const d = document.createElement("div");
            d.className = `tile ${t.c} ${t.revealed ? 'revealed' : 'hidden'}`;
            d.innerHTML = `<span class="tile-value">${t.revealed ? t.v : "?"}</span>`;
            
            // ถ้าเป็นตาเรา และเราจั่วไพ่แล้ว สามารถเลือกทายไพ่คู่ต่อสู้ได้
            if (gameData.turn === myId && hasDrawn && !t.revealed) {
                d.onclick = () => openGuessModal(uid, i);
                d.classList.add("targetable");
            }
            hand.appendChild(d);
        });
        div.appendChild(hand);
        oppCont.appendChild(div);
    });

    document.getElementById("deck-count").innerText = gameData.deck.length;
    document.getElementById("draw-btn").style.display = (gameData.turn === myId && !hasDrawn) ? "inline-block" : "none";
}

window.drawTile = () => {
    if (gameData.deck.length === 0) {
        hasDrawn = true;
        render();
        return;
    }
    const deck = [...gameData.deck];
    const tile = deck.pop();
    tile.isNew = true; 
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
    const grid = document.getElementById("guess-number-grid");
    grid.innerHTML = "";
    for (let i = 0; i <= 11; i++) {
        const b = document.createElement("button");
        b.className = "guess-num-btn";
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
        alert("🎉 ยอดเยี่ยม! คุณถอดรหัสสำเร็จ");
        targetHand[idx].revealed = true;
        const updates = {};
        updates[`games/${gameId}/players/${uid}/hand`] = targetHand;
        update(ref(db), updates);
        
        // ให้เลือกว่าจะทายต่อหรือจบเทิร์น
        document.getElementById("end-turn-btn").style.display = "inline-block";
    } else {
        alert("❌ พลาด! คุณต้องเปิดเผยรหัสลับของตัวเองหนึ่งใบ");
        revealMyTile();
        window.endTurn();
    }
    window.closeGuessModal();
}

function revealMyTile() {
    const myHand = [...gameData.players[myId].hand];
    const hidden = myHand.filter(t => !t.revealed);
    if (hidden.length > 0) {
        // กฎ: ถ้าทายผิด ต้องเปิดไพ่ใบที่เพิ่งจั่วมา (ถ้ามี)
        const newTile = myHand.find(t => t.isNew);
        if (newTile) newTile.revealed = true;
        else {
            // ถ้าไม่มีใบที่เพิ่งจั่ว (กรณีไม่มีไพ่ให้จั่วแล้ว) ให้เปิดใบซ้ายสุดที่ยังไม่เปิด
            const firstHidden = myHand.find(t => !t.revealed);
            if (firstHidden) firstHidden.revealed = true;
        }
        
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

window.closeGuessModal = () => {
    document.getElementById("guess-modal").style.display = "none";
};

function sortTiles(tiles) {
    // เรียงเลขน้อยไปมาก ถ้าเลขเท่ากัน สีดำต้องอยู่ก่อนสีขาว (กฎมาตรฐาน)
    return tiles.sort((a, b) => (a.v === b.v) ? (a.c === 'black' ? -1 : 1) : a.v - b.v);
}

// เริ่มการทำงาน
init();
