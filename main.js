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

// 2. การเริ่มต้นระบบ (Identity & Connection)
async function init() {
    try {
        // พยายามเชื่อมต่อผ่าน Discord SDK
        const discordSdk = new DiscordSDK("1318854457788104764");
        await discordSdk.ready();
        const auth = await discordSdk.commands.authenticate();
        myId = auth.user.id;
        gameId = discordSdk.channelId;
        console.log("Mode: Discord Activity");
    } catch (e) {
        // หากไม่ได้เล่นใน Discord ให้ใช้ระบบ Web Mode (ID สุ่ม)
        myId = localStorage.getItem("dv_uid") || "p_" + Math.random().toString(36).substr(2, 5);
        localStorage.setItem("dv_uid", myId);
        gameId = window.location.hash.substring(1) || "lobby";
        if (!window.location.hash) window.location.hash = "lobby";
        console.log("Mode: Web Browser (Room: " + gameId + ")");
    }

    // ติดตามการเปลี่ยนแปลงข้อมูลใน Firebase
    const gameRef = ref(db, `games/${gameId}`);
    onValue(gameRef, (snapshot) => {
        gameData = snapshot.val();
        
        if (!gameData) {
            setupNewGame();
        } else {
            // ระบบเข้าร่วมเกม (Join) สำหรับผู้เล่นคนที่ 2
            if (!gameData.players[myId] && Object.keys(gameData.players).length < 2) {
                joinGame();
            } else {
                renderGame();
            }
        }
    });
}

// 3. กฎการจัดการไพ่ (Game Logic)
function setupNewGame() {
    const deck = [];
    for (let i = 0; i <= 11; i++) {
        deck.push({ v: i, c: 'black', revealed: false });
        deck.push({ v: i, c: 'white', revealed: false });
    }
    deck.sort(() => Math.random() - 0.5); // Shuffle

    // แจกไพ่เริ่มต้นคนละ 4 ใบ
    const p1Hand = sortTiles(deck.splice(0, 4));
    const p2Hand = deck.splice(0, 4); // เก็บไว้รอคนมา Join

    set(ref(db, `games/${gameId}`), {
        deck,
        players: {
            [myId]: { hand: p1Hand, clueTile: null }
        },
        waitingHand: p2Hand, 
        turn: myId,
        state: "PLAYING"
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
    // เรียงจากน้อยไปมาก ถ้าเลขเท่ากัน สีดำอยู่ซ้าย
    return tiles.sort((a, b) => (a.v === b.v) ? (a.c === 'black' ? -1 : 1) : a.v - b.v);
}

// 4. ระบบการเล่น (Actions)
window.drawTile = () => {
    if (gameData.turn !== myId || (gameData.players[myId] && gameData.players[myId].clueTile)) {
        alert("ไม่ใช่ตาของคุณ หรือคุณจั่วไพ่ไปแล้ว!");
        return;
    }
    
    if (gameData.deck.length === 0) {
        alert("ไพ่หมดกองแล้ว! เริ่มทายได้เลย");
        // ในกติกาจริงถ้าไพ่หมดให้ข้ามไปขั้นตอนทายเลย
        update(ref(db, `games/${gameId}/players/${myId}`), { clueTile: { v: 'none', dummy: true } });
        return;
    }

    const newDeck = [...gameData.deck];
    const drawnTile = newDeck.pop();
    
    update(ref(db, `games/${gameId}`), {
        deck: newDeck,
        [`players/${myId}/clueTile`]: drawnTile
    });
};

window.selectTile = (index) => {
    if (gameData.turn !== myId) return;
    if (!gameData.players[myId].clueTile) {
        alert("กรุณาจั่วไพ่ก่อนทาย!");
        return;
    }

    const guess = prompt("ทายเลขไพ่ใบนี้ (0-11):");
    if (guess === null) return;

    const opponentId = Object.keys(gameData.players).find(id => id !== myId);
    const targetTile = gameData.players[opponentId].hand[index];

    if (parseInt(guess) === targetTile.v) {
        // ทายถูก: เปิดไพ่คู่ต่อสู้
        alert("ถูกต้อง! คุณจะทายใบอื่นต่อ หรือกด 'จบเทิร์น' เพื่อเก็บไพ่ลับ");
        targetTile.revealed = true;
        update(ref(db, `games/${gameId}`), gameData);
    } else {
        // ทายผิด: เปิดไพ่ตัวเองและจบเทิร์น
        alert("ทายผิด! ไพ่ที่คุณจั่วมาจะถูกเปิดเผย");
        const clue = gameData.players[myId].clueTile;
        if (clue && !clue.dummy) {
            clue.revealed = true;
            gameData.players[myId].hand.push(clue);
        }
        gameData.players[myId].hand = sortTiles(gameData.players[myId].hand);
        gameData.players[myId].clueTile = null;
        
        switchTurn();
        update(ref(db, `games/${gameId}`), gameData);
    }
};

window.endTurn = () => {
    const clue = gameData.players[myId].clueTile;
    if (clue && !clue.dummy) {
        gameData.players[myId].hand.push(clue);
    }
    gameData.players[myId].hand = sortTiles(gameData.players[myId].hand);
    gameData.players[myId].clueTile = null;
    
    switchTurn();
    update(ref(db, `games/${gameId}`), gameData);
};

function switchTurn() {
    const players = Object.keys(gameData.players);
    gameData.turn = players.find(id => id !== gameData.turn);
}

// 5. การแสดงผล (UI Rendering)
function renderGame() {
    const me = gameData.players[myId];
    if (!me) return;

    const isMyTurn = gameData.turn === myId;
    document.getElementById("game-status").innerText = isMyTurn ? "ตาของคุณ!" : "รอคู่ต่อสู้...";
    document.getElementById("deck-count").innerText = gameData.deck.length;

    // แสดงปุ่ม "จบเทิร์น" เมื่อทายถูกอย่างน้อย 1 ใบ (ในที่นี้เช็คจากว่ามีการเปิดไพ่คู่ต่อสู้เพิ่มไหม)
    const endTurnBtn = document.getElementById("end-turn-btn");
    if (endTurnBtn) {
        endTurnBtn.style.display = (isMyTurn && me.clueTile) ? "inline-block" : "none";
    }

    // แสดงไพ่เรา
    const myHandDiv = document.getElementById("my-hand");
    myHandDiv.innerHTML = "";
    me.hand.forEach(tile => {
        const div = document.createElement("div");
        div.className = `tile ${tile.c} ${tile.revealed ? 'revealed' : ''}`;
        div.innerText = tile.v;
        myHandDiv.appendChild(div);
    });

    // แสดงไพ่ที่เพิ่งจั่ว (Clue Tile)
    const clueDiv = document.getElementById("clue-area");
    if (clueDiv) {
        clueDiv.innerHTML = me.clueTile && !me.clueTile.dummy ? 
            `<p>ไพ่ที่จั่วได้: <span class="tile ${me.clueTile.c}">${me.clueTile.v}</span></p>` : "";
    }

    // แสดงไพ่คู่ต่อสู้
    const opponentId = Object.keys(gameData.players).find(id => id !== myId);
    const oppHandDiv = document.getElementById("opponent-hand");
    oppHandDiv.innerHTML = "";
    if (opponentId) {
        gameData.players[opponentId].hand.forEach((tile, index) => {
            const div = document.createElement("div");
            div.className = `tile ${tile.c} ${tile.revealed ? 'revealed' : 'hidden'}`;
            div.innerText = tile.revealed ? tile.v : "?";
            div.onclick = () => selectTile(index);
            oppHandDiv.appendChild(div);
        });
    }
}

init();
