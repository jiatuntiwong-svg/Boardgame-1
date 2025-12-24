import { DiscordSDK } from "@discord/embedded-app-sdk";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, onValue, update } from "firebase/database";

// 1. Firebase Config (ใช้ค่าเดิมของคุณ)
const firebaseConfig = {
    apiKey: "AIzaSyBMoaV77NoBNY3oBqQrmOuyPYyzP97N-ko",
    databaseURL: "https://boardgame-59909-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "boardgame-59909",
};
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// 2. ตัวแปรสถานะ
let myId, gameId, gameData;
let selectedOpponentTileIndex = null;
const isDiscord = window.location.hostname.includes("discord") || window.location.hostname.includes("vercel.app");

// 3. ฟังก์ชันเริ่มต้น
async function init() {
    // ตรวจสอบว่ารันบน Discord หรือ Web Browser ปกติ
    try {
        const discordSdk = new DiscordSDK("YOUR_CLIENT_ID"); // แทนที่ด้วย Client ID ของคุณ
        await discordSdk.ready();
        const auth = await discordSdk.commands.authenticate();
        myId = auth.user.id;
        gameId = discordSdk.channelId;
    } catch (e) {
        // Fallback สำหรับ Browser ปกติ
        myId = localStorage.getItem("davinci_id") || "p_" + Math.random().toString(36).substr(2, 5);
        localStorage.setItem("davinci_id", myId);
        gameId = window.location.hash.substring(1) || "main_room";
        if (!window.location.hash) window.location.hash = gameId;
    }

    const gameRef = ref(db, `games/${gameId}`);
    onValue(gameRef, (snapshot) => {
        gameData = snapshot.val();
        if (!gameData) {
            setupNewGame();
        } else {
            checkAndJoinGame();
        }
    });
}

[cite_start]// 4. สร้างเกมใหม่ (กติกา Setup [cite: 39, 40])
function setupNewGame() {
    const deck = [];
    for (let i = 0; i <= 11; i++) {
        deck.push({ v: i, c: 'black', revealed: false });
        deck.push({ v: i, c: 'white', revealed: false });
    }
    deck.sort(() => Math.random() - 0.5);

    const p1Hand = sortTiles(deck.splice(0, 4)); [cite_start]// แจก 4 ใบ [cite: 40]
    const p2Hand = deck.splice(0, 4); // เตรียมไว้สำหรับคนที่จะมา Join

    set(ref(db, `games/${gameId}`), {
        deck,
        players: {
            [myId]: { hand: p1Hand, clueTile: null },
            "WAITING_PLAYER": { hand: p2Hand, clueTile: null }
        },
        turn: myId,
        state: "PLAYING"
    });
}

// ผู้เล่นคนที่ 2 เข้ามาเสียบแทนที่ WAITING_PLAYER
function checkAndJoinGame() {
    const playerIds = Object.keys(gameData.players);
    if (playerIds.includes("WAITING_PLAYER") && !playerIds.includes(myId)) {
        const waitingHand = gameData.players["WAITING_PLAYER"].hand;
        delete gameData.players["WAITING_PLAYER"];
        gameData.players[myId] = { hand: sortTiles(waitingHand), clueTile: null };
        update(ref(db, `games/${gameId}`), gameData);
    } else {
        renderGame();
    }
}

[cite_start]// 5. กฎการเรียงไพ่ (ดำอยู่ซ้ายหากเลขซ้ำ [cite: 46])
function sortTiles(tiles) {
    return tiles.sort((a, b) => {
        [cite_start]if (a.v === b.v) return a.c === 'black' ? -1 : 1; // เลขเท่ากัน ดำอยู่ซ้าย [cite: 46]
        return a.v - b.v; [cite_start]// น้อยไปมาก [cite: 43]
    });
}

[cite_start]// 6. การจั่วไพ่ (Clue Tile [cite: 48])
window.drawTile = () => {
    if (gameData.turn !== myId || gameData.players[myId].clueTile || gameData.deck.length === 0) return;
    
    const newDeck = [...gameData.deck];
    const tile = newDeck.pop();
    gameData.deck = newDeck;
    gameData.players[myId].clueTile = tile; [cite_start]// เก็บไว้เป็น Clue Tile [cite: 48]
    update(ref(db, `games/${gameId}`), gameData);
};

[cite_start]// 7. การทายเลข [cite: 53, 55, 57]
window.selectTile = (index) => {
    if (gameData.turn !== myId || !gameData.players[myId].clueTile) {
        alert("ต้องจั่วไพ่ก่อนทาย!");
        return;
    }
    selectedOpponentTileIndex = index;
    const guess = prompt("ทายเลขไพ่ใบนี้ (0-11):");
    if (guess !== null) makeGuess(parseInt(guess));
};

async function makeGuess(guess) {
    const opponentId = Object.keys(gameData.players).find(id => id !== myId);
    const targetTile = gameData.players[opponentId].hand[selectedOpponentTileIndex];

    if (guess === targetTile.v) {
        targetTile.revealed = true; [cite_start]// ทายถูก: เปิดไพ่คู่ต่อสู้ [cite: 55]
        alert("ทายถูก! คุณสามารถทายต่อหรือหยุดเพื่อเก็บไพ่ลับ");
    } else {
        [cite_start]// ทายผิด: เปิดเผย Clue Tile ของตัวเอง [cite: 57]
        const clue = gameData.players[myId].clueTile;
        clue.revealed = true;
        gameData.players[myId].hand.push(clue);
        gameData.players[myId].hand = sortTiles(gameData.players[myId].hand);
        gameData.players[myId].clueTile = null;
        alert("ทายผิด! ไพ่ของคุณถูกเปิดเผย");
        switchTurn();
    }
    update(ref(db, `games/${gameId}`), gameData);
}

window.endTurn = () => {
    [cite_start]// จบเทิร์นแบบสมัครใจ: นำ Clue Tile เข้าแถวแบบไม่เปิดเผย [cite: 62]
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
    const nextPlayer = Object.keys(gameData.players).find(id => id !== myId);
    gameData.turn = nextPlayer;
}

// 8. แสดงผล
function renderGame() {
    const isMyTurn = gameData.turn === myId;
    document.getElementById("game-status").innerText = isMyTurn ? "ตาของคุณ!" : "รอคู่ต่อสู้...";
    document.getElementById("deck-count").innerText = gameData.deck.length;

    // แสดงไพ่เรา
    const myHandDiv = document.getElementById("my-hand");
    myHandDiv.innerHTML = "";
    gameData.players[myId].hand.forEach(tile => {
        const div = document.createElement("div");
        div.className = `tile ${tile.c} ${tile.revealed ? 'revealed' : ''}`;
        div.innerText = tile.v;
        myHandDiv.appendChild(div);
    });

    // แสดง Clue Tile
    const clue = gameData.players[myId].clueTile;
    const clueDiv = document.getElementById("clue-area") || document.body; 
    // แนะนำให้เพิ่ม <div id="clue-area"></div> ใน index.html
    if (clue) {
        console.log("คุณจั่วได้:", clue.v, clue.c);
    }

    // แสดงไพ่คู่ต่อสู้
    const opponentId = Object.keys(gameData.players).find(id => id !== myId);
    const oppHandDiv = document.getElementById("opponent-hand");
    oppHandDiv.innerHTML = "";
    if (opponentId) {
        gameData.players[opponentId].hand.forEach((tile, index) => {
            const div = document.createElement("div");
            div.className = `tile ${tile.c} ${tile.revealed ? '' : 'hidden'}`;
            div.innerText = tile.revealed ? tile.v : "?";
            div.onclick = () => selectTile(index);
            oppHandDiv.appendChild(div);
        });
    }
}

init();
