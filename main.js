import { DiscordSDK } from "@discord/embedded-app-sdk";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, onValue, update } from "firebase/database";

// 1. Firebase Config (ตรวจสอบ DatabaseURL ให้ตรงกับหน้าเว็บ Firebase ของคุณ)
const firebaseConfig = {
    apiKey: "AIzaSyBMoaV77NoBNY3oBqQrmOuyPYyzP97N-ko",
    databaseURL: "https://boardgame-59909-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "boardgame-59909",
};
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

let myId, gameId, gameData;

// ฟังก์ชันระบุตัวตน (รองรับ Web และ Discord)
async function setupIdentity() {
    try {
        // เช็คว่าอยู่ใน Discord หรือไม่
        if (window.location.hostname.includes("discord") || window.location.search.includes("frame_id")) {
            const discordSdk = new DiscordSDK("1318854457788104764"); // ใส่ Client ID ของคุณ
            await discordSdk.ready();
            const auth = await discordSdk.commands.authenticate();
            myId = auth.user.id;
            gameId = discordSdk.channelId;
            console.log("เข้าเล่นผ่าน: Discord", myId);
        } else {
            throw new Error("Not in Discord");
        }
    } catch (e) {
        // เล่นผ่าน Web ทั่วไป: ใช้ ID สุ่ม และห้องจาก URL Hash (#room1)
        myId = localStorage.getItem("dv_player_id") || "p_" + Math.random().toString(36).substr(2, 5);
        localStorage.setItem("dv_player_id", myId);
        gameId = window.location.hash.substring(1) || "lobby";
        if (!window.location.hash) window.location.hash = "lobby";
        console.log("เข้าเล่นผ่าน: Web Browser", myId, "Room:", gameId);
    }
}

// 2. เริ่มต้นเกม
async function init() {
    await setupIdentity();

    const gameRef = ref(db, `games/${gameId}`);
    onValue(gameRef, (snapshot) => {
        gameData = snapshot.val();
        
        const statusEl = document.getElementById("game-status");
        if (statusEl) statusEl.innerText = "เชื่อมต่อสำเร็จ!";

        if (!gameData) {
            setupNewGame();
        } else {
            // ระบบผู้เล่นคนที่ 2 (Join)
            if (!gameData.players[myId] && Object.keys(gameData.players).length < 2) {
                joinGame();
            } else {
                renderGame();
            }
        }
    }, (error) => {
        console.error("Firebase Error:", error);
        alert("เชื่อมต่อฐานข้อมูลไม่ได้! เช็ค Rules ใน Firebase");
    });
}

// 3. กฎ Da Vinci Code (อ้างอิงจากคู่มือ)
function setupNewGame() {
    const deck = [];
    for (let i = 0; i <= 11; i++) {
        deck.push({ v: i, c: 'black', revealed: false });
        deck.push({ v: i, c: 'white', revealed: false });
    }
    deck.sort(() => Math.random() - 0.5); [cite_start]// [cite: 39]

    [cite_start]// แจกคนละ 4 ใบ [cite: 40]
    const p1Hand = sortTiles(deck.splice(0, 4));
    const p2Hand = deck.splice(0, 4); 

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
    update(ref(db, `games/${gameId}`), { players: gameData.players });
}

[cite_start]// กฎการเรียงไพ่: น้อยไปมาก [cite: 43] [cite_start]และถ้าเลขเท่ากันสีดำอยู่ซ้าย [cite: 46]
function sortTiles(tiles) {
    return tiles.sort((a, b) => (a.v === b.v) ? (a.c === 'black' ? -1 : 1) : a.v - b.v);
}

// 4. การแสดงผล
function renderGame() {
    if (!gameData.players[myId]) return;

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

    // แสดงไพ่คู่ต่อสู้
    const opponentId = Object.keys(gameData.players).find(id => id !== myId);
    const oppHandDiv = document.getElementById("opponent-hand");
    oppHandDiv.innerHTML = "";
    if (opponentId) {
        gameData.players[opponentId].hand.forEach((tile, index) => {
            const div = document.createElement("div");
            div.className = `tile ${tile.c} ${tile.revealed ? 'revealed' : 'hidden'}`;
            div.innerText = tile.revealed ? tile.v : "?";
            [cite_start]// คลิกเพื่อทายเลข [cite: 53]
            div.onclick = () => { if(isMyTurn) alert("คลิกเพื่อทายเลขไพ่ใบที่ " + (index+1)); };
            oppHandDiv.appendChild(div);
        });
    }
}

init();
