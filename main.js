import { DiscordSDK } from "@discord/embedded-app-sdk";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, onValue, update } from "firebase/database";

// 1. Firebase Config (ใส่ของคุณที่นี่)
const firebaseConfig = {
    apiKey: "AIzaSyBMoaV77NoBNY3oBqQrmOuyPYyzP97N-ko",
    databaseURL: "https://boardgame-59909-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "boardgame-59909",
};
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// 2. Discord SDK Setup
const discordSdk = new DiscordSDK("YOUR_CLIENT_ID");
let myId, gameId, gameData;
let selectedOpponentTileIndex = null;

async function init() {
    await discordSdk.ready();
    const auth = await discordSdk.commands.authenticate();
    myId = auth.user.id;
    gameId = discordSdk.channelId;

    const gameRef = ref(db, `games/${gameId}`);
    onValue(gameRef, (snapshot) => {
        gameData = snapshot.val();
        if (!gameData) {
            setupNewGame();
        } else {
            renderGame();
        }
    });
}

// สร้างเกมใหม่ (ไพ่ 24 ใบ )
function setupNewGame() {
    const deck = [];
    for (let i = 0; i <= 11; i++) {
        deck.push({ v: i, c: 'black', revealed: false });
        deck.push({ v: i, c: 'white', revealed: false });
    }
    // Shuffle deck
    deck.sort(() => Math.random() - 0.5);

    // แจกไพ่คนละ 4 ใบ [cite: 40]
    const p1Hand = sortTiles(deck.splice(0, 4));
    const p2Hand = sortTiles(deck.splice(0, 4));

    set(ref(db, `games/${gameId}`), {
        deck,
        players: {
            "HOST_ID": { hand: p1Hand, clueTile: null }, // ต้องเปลี่ยน HOST_ID เป็น ID จริง
            "JOINER_ID": { hand: p2Hand, clueTile: null }
        },
        turn: "HOST_ID",
        state: "PLAYING"
    });
}

// ฟังก์ชันเรียงไพ่ตามกฎ 
function sortTiles(tiles) {
    return tiles.sort((a, b) => (a.v === b.v) ? (a.c === 'black' ? -1 : 1) : a.v - b.v);
}

// แสดงผลหน้าจอ
function renderGame() {
    const status = document.getElementById("game-status");
    const isMyTurn = gameData.turn === myId;
    status.innerText = isMyTurn ? "ตาของคุณ!" : "รอคู่ต่อสู้...";

    // แสดงไพ่เรา
    const myHandDiv = document.getElementById("my-hand");
    myHandDiv.innerHTML = "";
    gameData.players[myId].hand.forEach(tile => {
        const div = document.createElement("div");
        div.className = `tile ${tile.c} ${tile.revealed ? 'revealed' : ''}`;
        div.innerText = tile.v;
        myHandDiv.appendChild(div);
    });

    // แสดงไพ่คู่ต่อสู้
    const opponentId = Object.keys(gameData.players).find(id => id !== myId);
    const oppHandDiv = document.getElementById("opponent-hand");
    oppHandDiv.innerHTML = "";
    gameData.players[opponentId].hand.forEach((tile, index) => {
        const div = document.createElement("div");
        div.className = `tile ${tile.c} ${tile.revealed ? '' : 'hidden'}`;
        div.innerText = tile.v;
        div.onclick = () => { if(isMyTurn) selectTile(index); };
        oppHandDiv.appendChild(div);
    });

    document.getElementById("deck-count").innerText = gameData.deck.length;
}

// การทายเลข 
async function makeGuess() {
    const guess = parseInt(document.getElementById("guess-input").value);
    const opponentId = Object.keys(gameData.players).find(id => id !== myId);
    const targetTile = gameData.players[opponentId].hand[selectedOpponentTileIndex];

    if (guess === targetTile.v) {
        // ทายถูก: ไพ่คู่ต่อสู้ถูกหงาย [cite: 55]
        targetTile.revealed = true;
        // คุณสามารถทายต่อหรือหยุด [cite: 56]
        alert("ทายถูก! จะทายต่อหรือจบเทิร์น?");
    } else {
        // ทายผิด: ต้องหงายไพ่ตัวเอง (Clue Tile) และจบเทิร์น [cite: 57, 69]
        alert("ทายผิด! ไพ่ของคุณถูกเปิดเผย");
        // Logic สำหรับการหงายไพ่ตนเองและสลับ Turn
        switchTurn();
    }
    update(ref(db, `games/${gameId}`), gameData);
}

function switchTurn() {
    const nextPlayer = Object.keys(gameData.players).find(id => id !== gameData.turn);
    gameData.turn = nextPlayer;
}

init();