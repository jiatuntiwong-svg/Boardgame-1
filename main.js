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

async function init() {
    // แก้ไข: เพิ่ม Try-Catch เพื่อไม่ให้หน้าจอค้างถ้าไม่ได้รันใน Discord
    try {
        const discordSdk = new DiscordSDK("1318854457788104764");
        await discordSdk.ready();
        const auth = await discordSdk.commands.authenticate();
        myId = auth.user.id;
        gameId = discordSdk.channelId;
    } catch (e) {
        // เล่นผ่านเว็บปกติ: ใช้ ID สุ่มและ Room จาก URL Hash (#room1)
        myId = localStorage.getItem("player_id") || "p_" + Math.random().toString(36).substr(2, 5);
        localStorage.setItem("player_id", myId);
        gameId = window.location.hash.substring(1) || "default_room";
        if(!window.location.hash) window.location.hash = gameId;
    }

    const gameRef = ref(db, `games/${gameId}`);
    onValue(gameRef, (snapshot) => {
        gameData = snapshot.val();
        if (!gameData) {
            setupNewGame();
        } else {
            // ระบบ Join อัตโนมัติสำหรับผู้เล่นคนที่ 2
            if (!gameData.players[myId] && Object.keys(gameData.players).length < 2) {
                joinGame();
            } else {
                renderGame();
            }
        }
    });
}

// สร้างเกมใหม่ตามกฎ: ไพ่ 24 ใบ [cite: 39] แจกคนละ 4 ใบ 
function setupNewGame() {
    const deck = [];
    for (let i = 0; i <= 11; i++) {
        deck.push({ v: i, c: 'black', revealed: false });
        deck.push({ v: i, c: 'white', revealed: false });
    }
    deck.sort(() => Math.random() - 0.5); // ผสมไพ่ [cite: 39]

    const p1Hand = sortTiles(deck.splice(0, 4));
    const p2Hand = deck.splice(0, 4); // เก็บไว้ให้คนถัดไป

    set(ref(db, `games/${gameId}`), {
        deck,
        players: {
            [myId]: { hand: p1Hand, clueTile: null }
        },
        waitingHand: p2Hand, // สำรองไว้
        turn: myId,
        state: "PLAYING"
    });
}

function joinGame() {
    const hand = sortTiles(gameData.waitingHand);
    gameData.players[myId] = { hand: hand, clueTile: null };
    update(ref(db, `games/${gameId}`), { players: gameData.players });
}

// กฎการเรียง: น้อยไปมาก [cite: 43] ถ้าเลขซ้ำสีดำอยู่ซ้าย [cite: 46]
function sortTiles(tiles) {
    return tiles.sort((a, b) => (a.v === b.v) ? (a.c === 'black' ? -1 : 1) : a.v - b.v);
}

function renderGame() {
    if (!gameData.players[myId]) return;
    
    document.getElementById("game-status").innerText = (gameData.turn === myId) ? "ตาของคุณ!" : "รอคู่ต่อสู้...";
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

    // แสดงไพ่คู่ต่อสู้ (ถ้ามี)
    const opponentId = Object.keys(gameData.players).find(id => id !== myId);
    if (opponentId) {
        const oppHandDiv = document.getElementById("opponent-hand");
        oppHandDiv.innerHTML = "";
        gameData.players[opponentId].hand.forEach((tile, index) => {
            const div = document.createElement("div");
            div.className = `tile ${tile.c} ${tile.revealed ? 'revealed' : 'hidden'}`;
            div.innerText = tile.revealed ? tile.v : "?";
            // คลิกเพื่อทายเลขตามกติกา [cite: 53]
            div.onclick = () => { if(gameData.turn === myId) askGuess(index); };
            oppHandDiv.appendChild(div);
        });
    }
}

init();
