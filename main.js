import { DiscordSDK } from "@discord/embedded-app-sdk";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, onValue, update } from "firebase/database";

// 1. Firebase Config
const firebaseConfig = {
    apiKey: "AIzaSyBMoaV77NoBNY3oBqQrmOuyPYyzP97N-ko",
    databaseURL: "https://boardgame-59909-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "boardgame-59909",
};
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

let myId, gameId, gameData;

// 2. เริ่มต้นระบบระบุตัวตน
async function init() {
    try {
        const discordSdk = new DiscordSDK("1318854457788104764");
        await discordSdk.ready();
        const auth = await discordSdk.commands.authenticate();
        myId = auth.user.id;
        gameId = discordSdk.channelId;
    } catch (e) {
        // Fallback สำหรับ Web Browser ปกติ
        myId = localStorage.getItem("dv_uid") || "p_" + Math.random().toString(36).substr(2, 5);
        localStorage.setItem("dv_uid", myId);
        gameId = window.location.hash.substring(1) || "room1";
        if (!window.location.hash) window.location.hash = "room1";
    }

    // แสดง URL สำหรับแชร์ในหน้า Lobby
    const shareInput = document.getElementById("share-url");
    if(shareInput) shareInput.value = window.location.href;

    // ติดตามข้อมูลจาก Firebase
    const gameRef = ref(db, `games/${gameId}`);
    onValue(gameRef, (snapshot) => {
        gameData = snapshot.val();
        if (!gameData) {
            setupNewGame();
        } else {
            handleGameState();
        }
    });
}

// 3. จัดการสถานะหน้าจอ (Lobby vs Board)
function handleGameState() {
    const players = gameData.players || {};
    const playerCount = Object.keys(players).length;

    if (playerCount < 2) {
        if (!players[myId]) {
            joinGame();
        } else {
            document.getElementById("lobby-screen").style.display = "block";
            document.getElementById("game-board").style.display = "none";
            document.getElementById("game-status").innerText = "กำลังรอผู้เล่นคนที่ 2...";
        }
    } else {
        document.getElementById("lobby-screen").style.display = "none";
        document.getElementById("game-board").style.display = "block";
        renderGame();
    }
}

// 4. กฎเกม (Logic)
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
        players: { [myId]: { hand: p1Hand, clueTile: null } },
        waitingHand: p2Hand, 
        turn: myId
    });
}

function joinGame() {
    const hand = sortTiles(gameData.waitingHand);
    gameData.players[myId] = { hand: hand, clueTile: null };
    update(ref(db, `games/${gameId}`), { 
        players: gameData.players,
        waitingHand: null 
    });
}

function sortTiles(tiles) {
    return tiles.sort((a, b) => (a.v === b.v) ? (a.c === 'black' ? -1 : 1) : a.v - b.v);
}

// 5. Actions (ผูกกับ window เพื่อให้ HTML เรียกได้)
window.drawTile = () => {
    if (gameData.turn !== myId || gameData.players[myId].clueTile) return;
    const newDeck = [...gameData.deck];
    const drawn = newDeck.pop();
    update(ref(db, `games/${gameId}`), {
        deck: newDeck,
        [`players/${myId}/clueTile`]: drawn
    });
};

window.selectTile = (index) => {
    if (gameData.turn !== myId || !gameData.players[myId].clueTile) {
        alert("จั่วไพ่ก่อนทาย!"); return;
    }
    const guess = prompt("ทายเลขใบนี้ (0-11):");
    if (guess === null) return;

    const oppId = Object.keys(gameData.players).find(id => id !== myId);
    const target = gameData.players[oppId].hand[index];

    if (parseInt(guess) === target.v) {
        alert("ถูกต้อง! ทายต่อหรือจบเทิร์น");
        target.revealed = true;
        update(ref(db, `games/${gameId}`), gameData);
    } else {
        alert("ผิด! ต้องเปิดไพ่ตัวเอง");
        const clue = gameData.players[myId].clueTile;
        clue.revealed = true;
        gameData.players[myId].hand.push(clue);
        gameData.players[myId].hand = sortTiles(gameData.players[myId].hand);
        gameData.players[myId].clueTile = null;
        switchTurn();
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
};

function switchTurn() {
    const ids = Object.keys(gameData.players);
    gameData.turn = ids.find(id => id !== gameData.turn);
    update(ref(db, `games/${gameId}`), gameData);
}

// 6. การแสดงผล
function renderGame() {
    const me = gameData.players[myId];
    const isMyTurn = gameData.turn === myId;
    document.getElementById("game-status").innerText = isMyTurn ? "🔴 ตาของคุณ" : "⚪ รอคู่ต่อสู้...";
    document.getElementById("deck-count").innerText = gameData.deck.length;

    // ปุ่มควบคุม
    document.getElementById("draw-btn").disabled = !!me.clueTile || !isMyTurn;
    document.getElementById("end-turn-btn").style.display = (isMyTurn && me.clueTile) ? "inline-block" : "none";

    // ไพ่เรา
    const myDiv = document.getElementById("my-hand");
    myDiv.innerHTML = "";
    me.hand.forEach(t => {
        const d = document.createElement("div");
        d.className = `tile ${t.c} ${t.revealed ? 'revealed' : ''}`;
        d.innerText = t.v;
        myDiv.appendChild(d);
    });

    // ไพ่จั่ว (Clue)
    const clueArea = document.getElementById("clue-area");
    clueArea.innerHTML = me.clueTile ? `<p>ไพ่ที่เพิ่งจั่ว: <span class="tile ${me.clueTile.c}">${me.clueTile.v}</span></p>` : "";

    // ไพ่คู่ต่อสู้
    const oppId = Object.keys(gameData.players).find(id => id !== myId);
    const oppDiv = document.getElementById("opponent-hand");
    oppDiv.innerHTML = "";
    gameData.players[oppId].hand.forEach((t, i) => {
        const d = document.createElement("div");
        d.className = `tile ${t.c} ${t.revealed ? 'revealed' : 'hidden'}`;
        d.innerText = t.revealed ? t.v : "?";
        d.onclick = () => window.selectTile(i);
        oppDiv.appendChild(d);
    });
}

init();
