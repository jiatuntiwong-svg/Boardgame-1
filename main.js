import { DiscordSDK } from "@discord/embedded-app-sdk";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, onValue, update } from "firebase/database";

// 1. Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyBMoaV77NoBNY3oBqQrmOuyPYyzP97N-ko",
    databaseURL: "https://boardgame-59909-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "boardgame-59909",
};
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

let myId, gameId, gameData;

// 2. เริ่มต้นระบบ (Identity)
async function init() {
    try {
        const discordSdk = new DiscordSDK("1318854457788104764");
        await discordSdk.ready();
        const auth = await discordSdk.commands.authenticate();
        myId = auth.user.id;
        gameId = discordSdk.channelId;
    } catch (e) {
        // สำหรับทดสอบบน Web ปกติ
        myId = localStorage.getItem("dv_uid") || "p_" + Math.random().toString(36).substr(2, 5);
        localStorage.setItem("dv_uid", myId);
        gameId = window.location.hash.substring(1) || "lobby";
        if (!window.location.hash) window.location.hash = "lobby";
    }

    // ติดตามข้อมูลจาก Firebase
    const gameRef = ref(db, `games/${gameId}`);
    onValue(gameRef, (snapshot) => {
        gameData = snapshot.val();
        if (!gameData) {
            setupNewGame();
        } else {
            // ระบบ Join เมื่อมีผู้เล่นคนที่ 2 เข้ามา
            if (!gameData.players[myId] && Object.keys(gameData.players).length < 2) {
                joinGame();
            } else {
                renderGame();
            }
        }
    });
}

// 3. Game Logic (แจกไพ่และเรียงไพ่)
function setupNewGame() {
    const deck = [];
    for (let i = 0; i <= 11; i++) {
        deck.push({ v: i, c: 'black', revealed: false });
        deck.push({ v: i, c: 'white', revealed: false });
    }
    deck.sort(() => Math.random() - 0.5);

    const p1Hand = sortTiles(deck.splice(0, 4));
    const p2Hand = deck.splice(0, 4); 

    set(ref(db, `games/${gameId}`), {
        deck,
        players: {
            [myId]: { hand: p1Hand, clueTile: null } // ใช้ ID จริงของผู้สร้าง
        },
        waitingHand: p2Hand, 
        turn: myId,
        state: "PLAYING"
    });
}

function joinGame() {
    const hand = sortTiles(gameData.waitingHand);
    gameData.players[myId] = { hand: hand, clueTile: null }; // เพิ่ม ID ของคนที่มา Join
    update(ref(db, `games/${gameId}`), { 
        players: gameData.players,
        waitingHand: null 
    });
}

function sortTiles(tiles) {
    return tiles.sort((a, b) => (a.v === b.v) ? (a.c === 'black' ? -1 : 1) : a.v - b.v);
}

// 4. ระบบการเล่น (Actions)
window.drawTile = () => {
    if (gameData.turn !== myId || (gameData.players[myId] && gameData.players[myId].clueTile)) {
        alert("ยังไม่ถึงตาคุณ หรือจั่วไปแล้ว!");
        return;
    }
    const newDeck = [...gameData.deck];
    const drawnTile = newDeck.pop();
    update(ref(db, `games/${gameId}/players/${myId}`), { clueTile: drawnTile });
    update(ref(db, `games/${gameId}`), { deck: newDeck });
};

window.selectTile = (index) => {
    if (gameData.turn !== myId || !gameData.players[myId].clueTile) {
        alert("ต้องจั่วไพ่ก่อนทาย!");
        return;
    }
    const guess = prompt("ทายเลขไพ่ใบนี้ (0-11):");
    if (guess === null) return;

    const opponentId = Object.keys(gameData.players).find(id => id !== myId);
    const targetTile = gameData.players[opponentId].hand[index];

    if (parseInt(guess) === targetTile.v) {
        alert("ทายถูก!");
        targetTile.revealed = true;
        update(ref(db, `games/${gameId}`), gameData);
    } else {
        alert("ทายผิด! ไพ่ที่คุณจั่วมาต้องเปิดเผย");
        const clue = gameData.players[myId].clueTile;
        clue.revealed = true;
        gameData.players[myId].hand.push(clue);
        gameData.players[myId].hand = sortTiles(gameData.players[myId].hand);
        gameData.players[myId].clueTile = null;
        switchTurn();
        update(ref(db, `games/${gameId}`), gameData);
    }
};

window.endTurn = () => {
    const clue = gameData.players[myId].clueTile;
    if (clue) {
        gameData.players[myId].hand.push(clue);
        gameData.players[myId].hand = sortTiles(gameData.players[myId].hand);
        gameData.players[myId].clueTile = null;
    }
    switchTurn();
    update(ref(db, `games/${gameId}`), gameData);
};

function switchTurn() {
    const players = Object.keys(gameData.players);
    gameData.turn = players.find(id => id !== gameData.turn);
}

// 5. แสดงผล UI
function renderGame() {
    const me = gameData.players[myId];
    if (!me) return;

    const isMyTurn = gameData.turn === myId;
    document.getElementById("game-status").innerText = isMyTurn ? "ตาของคุณ!" : "รอคู่ต่อสู้...";
    document.getElementById("deck-count").innerText = gameData.deck.length;

    // ปุ่มจบเทิร์น (แสดงเฉพาะเมื่อทายถูกและมีไพ่ในมือที่ยังไม่ได้เก็บ)
    const endBtn = document.getElementById("end-turn-btn");
    if (endBtn) endBtn.style.display = (isMyTurn && me.clueTile) ? "inline-block" : "none";

    // ไพ่ของเรา
    const myHandDiv = document.getElementById("my-hand");
    myHandDiv.innerHTML = "";
    me.hand.forEach(tile => {
        const div = document.createElement("div");
        div.className = `tile ${tile.c} ${tile.revealed ? 'revealed' : ''}`;
        div.innerText = tile.v;
        myHandDiv.appendChild(div);
    });

    // ไพ่ที่เพิ่งจั่วได้ (Clue)
    const clueArea = document.getElementById("clue-area");
    clueArea.innerHTML = me.clueTile ? `<p>ไพ่ที่จั่ว: <span class="tile ${me.clueTile.c}">${me.clueTile.v}</span></p>` : "";

    // ไพ่ของคู่ต่อสู้
    const opponentId = Object.keys(gameData.players).find(id => id !== myId);
    const oppHandDiv = document.getElementById("opponent-hand");
    oppHandDiv.innerHTML = "";
    if (opponentId) {
        gameData.players[opponentId].hand.forEach((tile, index) => {
            const div = document.createElement("div");
            // ถ้ายังไม่ถูกเปิดเผย ให้เป็นสีดำ/ขาวเปล่าๆ
            div.className = `tile ${tile.c} ${tile.revealed ? 'revealed' : 'hidden'}`;
            div.innerText = tile.revealed ? tile.v : "?";
            div.onclick = () => window.selectTile(index);
            oppHandDiv.appendChild(div);
        });
    }
}

init();
