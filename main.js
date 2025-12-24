import { DiscordSDK } from "@discord/embedded-app-sdk";
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

async function init() {
    // 1. ตรวจสอบ Identity (Discord หรือ Web)
    try {
        const discordSdk = new DiscordSDK("1318854457788104764");
        await discordSdk.ready();
        const auth = await discordSdk.commands.authenticate();
        myId = auth.user.id;
        gameId = discordSdk.channelId;
    } catch (e) {
        myId = localStorage.getItem("dv_uid") || "p_" + Math.random().toString(36).substr(2, 5);
        localStorage.setItem("dv_uid", myId);
        gameId = window.location.hash.substring(1) || "lobby";
        if (!window.location.hash) window.location.hash = "lobby";
    }

    // 2. เชื่อมต่อ Firebase
    const gameRef = ref(db, `games/${gameId}`);
    onValue(gameRef, (snapshot) => {
        gameData = snapshot.val();
        if (!gameData) {
            setupNewGame();
        } else {
            // ระบบ Join: ถ้าเรายังไม่มีในรายชื่อผู้เล่น และห้องยังไม่เต็ม (2 คน)
            if (!gameData.players[myId] && Object.keys(gameData.players).length < 2) {
                joinGame();
            } else {
                renderGame();
            }
        }
    });
}

function setupNewGame() {
    const deck = [];
    for (let i = 0; i <= 11; i++) {
        deck.push({ v: i, c: 'black', revealed: false });
        deck.push({ v: i, c: 'white', revealed: false });
    }
    deck.sort(() => Math.random() - 0.5);

    // แจกไพ่คนละ 4 ใบ
    const p1Hand = sortTiles(deck.splice(0, 4));
    const p2Hand = deck.splice(0, 4); // เก็บไว้ให้คนที่จะมา Join

    set(ref(db, `games/${gameId}`), {
        deck,
        players: {
            [myId]: { hand: p1Hand, clueTile: null } // ใช้ ID จริงของผู้เล่นคนแรก
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
    return tiles.sort((a, b) => (a.v === b.v) ? (a.c === 'black' ? -1 : 1) : a.v - b.v);
}

function renderGame() {
    if (!gameData.players[myId]) return;

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
    if (opponentId) {
        gameData.players[opponentId].hand.forEach((tile, index) => {
            const div = document.createElement("div");
            div.className = `tile ${tile.c} ${tile.revealed ? 'revealed' : 'hidden'}`;
            div.innerText = tile.revealed ? tile.v : "?";
            if (isMyTurn) div.onclick = () => alert("คุณเลือกใบที่ " + (index + 1) + " เพื่อทายเลข");
            oppHandDiv.appendChild(div);
        });
    }

    document.getElementById("deck-count").innerText = gameData.deck.length;
}

init();
