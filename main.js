import { DiscordSDK } from "@discord/embedded-app-sdk";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, onValue, update } from "firebase/database";

// 1. Firebase Configuration (ใช้ค่าที่คุณตั้งไว้)
const firebaseConfig = {
    apiKey: "AIzaSyBMoaV77NoBNY3oBqQrmOuyPYyzP97N-ko",
    databaseURL: "https://boardgame-59909-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "boardgame-59909",
};
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// 2. ตัวแปรสถานะเกม
let myId, gameId, gameData;
let selectedOpponentTileIndex = null;
const isDiscord = window.location.hostname.includes("discord");

// 3. ฟังก์ชันช่วยสำหรับเล่นบน Browser ปกติ
function getBrowserId() {
    let id = localStorage.getItem("davinci_player_id");
    if (!id) {
        id = "p_" + Math.random().toString(36).substr(2, 9);
        localStorage.setItem("davinci_player_id", id);
    }
    return id;
}

function getRoomId() {
    let room = window.location.hash.substring(1);
    if (!room) {
        room = "game-room-1"; // ห้องเริ่มต้น
        window.location.hash = room;
    }
    return room;
}

// 4. เริ่มต้นระบบ (Initialize)
async function init() {
    if (isDiscord) {
        try {
            const discordSdk = new DiscordSDK("YOUR_CLIENT_ID"); // ใส่ Client ID ของคุณ
            await discordSdk.ready();
            const auth = await discordSdk.commands.authenticate();
            myId = auth.user.id;
            gameId = discordSdk.channelId;
        } catch (e) {
            setupFallback();
        }
    } else {
        setupFallback();
    }

    const gameRef = ref(db, `games/${gameId}`);
    onValue(gameRef, (snapshot) => {
        gameData = snapshot.val();
        if (!gameData) {
            setupNewGame();
        } else {
            handleSync();
        }
    });
}

function setupFallback() {
    myId = getBrowserId();
    gameId = getRoomId();
    console.log("Playing in Browser - ID:", myId, "Room:", gameId);
}

// 5. สร้างเกมใหม่และจัดการผู้เล่น [cite: 39, 40]
function setupNewGame() {
    const deck = [];
    for (let i = 0; i <= 11; i++) {
        deck.push({ v: i, c: 'black', revealed: false });
        deck.push({ v: i, c: 'white', revealed: false });
    }
    deck.sort(() => Math.random() - 0.5); // สลับไพ่ 24 ใบ [cite: 39]

    const p1Hand = sortTiles(deck.splice(0, 4)); // แจกไพ่ 4 ใบ [cite: 40]
    const p2Hand = deck.splice(0, 4); // ไพ่สำหรับผู้เล่นคนที่ 2 (จะเรียงเมื่อเขา Join)

    set(ref(db, `games/${gameId}`), {
        deck,
        players: {
            [myId]: { hand: p1Hand, clueTile: null },
            "WAITING_PLAYER": { hand: p2Hand, clueTile: null }
        },
        turn: myId,
        state: "WAITING",
        lastGuessWasCorrect: false
    });
}

function handleSync() {
    const players = Object.keys(gameData.players);
    // กรณีมีคนมา Join ห้อง
    if (players.includes("WAITING_PLAYER") && !players.includes(myId)) {
        const newData = { ...gameData };
        const hand = newData.players["WAITING_PLAYER"].hand;
        delete newData.players["WAITING_PLAYER"];
        newData.players[myId] = { hand: sortTiles(hand), clueTile: null };
        newData.state = "PLAYING";
        update(ref(db, `games/${gameId}`), newData);
    } else {
        renderGame();
    }
}

// 6. กฎการเรียงไพ่ (Sorting Logic) 
function sortTiles(tiles) {
    return tiles.sort((a, b) => {
        if (a.v === b.v) {
            return a.c === 'black' ? -1 : 1; // เลขเท่ากัน ดำอยู่ซ้าย [cite: 46]
        }
        return a.v - b.v; // น้อยไปมาก [cite: 43]
    });
}

// 7. กลไกการเล่น (Gameplay)
async function drawClueTile() {
    if (gameData.turn !== myId || gameData.players[myId].clueTile) return;
    if (gameData.deck.length === 0) {
        alert("ไพ่ในกองหมดแล้ว! เริ่มการทายได้ทันที [cite: 17]");
        return;
    }

    const newDeck = [...gameData.deck];
    const tile = newDeck.pop();
    
    gameData.deck = newDeck;
    gameData.players[myId].clueTile = tile; // จั่วเป็น Clue Tile 
    update(ref(db, `games/${gameId}`), gameData);
}

window.selectTileToGuess = (index) => {
    if (gameData.turn !== myId || (!gameData.players[myId].clueTile && gameData.deck.length > 0)) {
        alert("คุณต้องจั่วไพ่ก่อนเริ่มทาย!");
        return;
    }
    selectedOpponentTileIndex = index;
    document.getElementById("guess-panel").classList.remove("hidden");
};

window.submitGuess = async () => {
    const guessInput = document.getElementById("guess-input");
    const guess = parseInt(guessInput.value);
    const opponentId = Object.keys(gameData.players).find(id => id !== myId);
    const targetTile = gameData.players[opponentId].hand[selectedOpponentTileIndex];

    if (guess === targetTile.v) {
        // ทายถูก 
        targetTile.revealed = true;
        gameData.lastGuessWasCorrect = true;
        alert("ถูกต้อง! คุณสามารถทายต่อหรือกด 'จบเทิร์น'");
    } else {
        // ทายผิด 
        const clue = gameData.players[myId].clueTile;
        if (clue) {
            clue.revealed = true; // ต้องหงายไพ่ตัวเอง 
            gameData.players[myId].hand.push(clue);
            gameData.players[myId].hand = sortTiles(gameData.players[myId].hand);
            gameData.players[myId].clueTile = null;
        }
        alert("ผิด! ไพ่ของคุณถูกเปิดเผยและจบเทิร์น [cite: 69]");
        endTurnLogic();
    }
    
    document.getElementById("guess-panel").classList.add("hidden");
    guessInput.value = "";
    update(ref(db, `games/${gameId}`), gameData);
};

window.finishTurn = () => {
    // จบเทิร์นแบบสมัครใจ (เมื่อทายถูกแล้วพอ) 
    const clue = gameData.players[myId].clueTile;
    if (clue) {
        gameData.players[myId].hand.push(clue); // นำเข้าแถวแบบลับๆ 
        gameData.players[myId].hand = sortTiles(gameData.players[myId].hand);
        gameData.players[myId].clueTile = null;
    }
    endTurnLogic();
    update(ref(db, `games/${gameId}`), gameData);
};

function endTurnLogic() {
    const nextPlayer = Object.keys(gameData.players).find(id => id !== gameData.turn);
    gameData.turn = nextPlayer;
    gameData.lastGuessWasCorrect = false;
}

// 8. การแสดงผล (Rendering)
function renderGame() {
    const isMyTurn = gameData.turn === myId;
    document.getElementById("game-status").innerText = isMyTurn ? "ตาของคุณ!" : "รอคู่ต่อสู้...";
    document.getElementById("deck-count").innerText = gameData.deck.length;

    // ไพ่เรา
    const myHandDiv = document.getElementById("my-hand");
    myHandDiv.innerHTML = "";
    gameData.players[myId].hand.forEach(tile => {
        const div = document.createElement("div");
        div.className = `tile ${tile.c} ${tile.revealed ? 'revealed' : ''}`;
        div.innerText = tile.v;
        myHandDiv.appendChild(div);
    });

    // แสดง Clue Tile ที่เพิ่งจั่วมา
    const clue = gameData.players[myId].clueTile;
    const clueArea = document.getElementById("my-clue-tile");
    clueArea.innerHTML = clue ? `<p>ไพ่ที่จั่วได้: </p><div class="tile ${clue.c}">${clue.v}</div>` : "";

    // ไพ่คู่ต่อสู้
    const opponentId = Object.keys(gameData.players).find(id => id !== myId);
    const oppHandDiv = document.getElementById("opponent-hand");
    oppHandDiv.innerHTML = "";
    if (opponentId) {
        gameData.players[opponentId].hand.forEach((tile, index) => {
            const div = document.createElement("div");
            div.className = `tile ${tile.c} ${tile.revealed ? '' : 'hidden'}`;
            div.innerText = tile.v;
            if (isMyTurn && !tile.revealed) div.onclick = () => selectTileToGuess(index);
            oppHandDiv.appendChild(div);
        });
    }

    // ปุ่มควบคุม
    document.getElementById("draw-btn").classList.toggle("hidden", !isMyTurn || !!clue || gameData.deck.length === 0);
    
    // สร้างปุ่ม End Turn ถ้ายังไม่มี
    let endBtn = document.getElementById("finish-turn-btn");
    if (endBtn) endBtn.classList.toggle("hidden", !isMyTurn || !gameData.lastGuessWasCorrect);

    checkWinner();
}

function checkWinner() {
    for (let id in gameData.players) {
        const allRevealed = gameData.players[id].hand.every(t => t.revealed);
        if (allRevealed && gameData.state !== "FINISHED") {
            const winner = Object.keys(gameData.players).find(pid => pid !== id);
            alert(winner === myId ? "คุณชนะแล้ว!" : "คุณแพ้แล้ว!");
            gameData.state = "FINISHED";
            update(ref(db, `games/${gameId}`), gameData);
        }
    }
}

// ผูก Event
document.getElementById("draw-btn").onclick = drawClueTile;
document.getElementById("submit-guess").onclick = window.submitGuess;

init();
