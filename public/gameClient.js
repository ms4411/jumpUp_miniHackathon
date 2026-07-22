// --- DOM 요소 ---
const authScreen = document.getElementById('authScreen');
const lobbyScreen = document.getElementById('lobbyScreen');
const gameScreen = document.getElementById('gameScreen');

const nicknameInput = document.getElementById('nickname');
const passwordInput = document.getElementById('password');
const authMessage = document.getElementById('authMessage');
const welcomeMsg = document.getElementById('welcomeMsg');
const matchStatus = document.getElementById('matchStatus');

const myHpBar = document.getElementById('myHpBar');
const enemyHpBar = document.getElementById('enemyHpBar');
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- 상태 변수 ---
let socket = null;
let myNickname = '';
let currentRoomId = '';
let myId = '';
let enemyId = '';

// 게임 상태
let me = { x: 100, y: 300, width: 30, height: 30, color: '#3498db', hp: 100, dir: 'right', isDashing: false };
let enemy = { x: 600, y: 300, width: 30, height: 30, color: '#e74c3c', hp: 100, dir: 'left', isDashing: false };
let bullets = []; // 총알 배열 {x, y, dx, dy, owner}
let swords = [];  // 칼 공격 배열 {x, y, owner, timer}
let keys = {};    // 눌린 키 상태

// --- 1. 인증 및 API (로그인/회원가입) ---

document.getElementById('registerBtn').addEventListener('click', async () => {
    const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: nicknameInput.value, password: passwordInput.value })
    });
    const data = await res.json();
    authMessage.innerText = data.message;
});

document.getElementById('loginBtn').addEventListener('click', async () => {
    const res = await fetch('/api/users/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: nicknameInput.value, password: passwordInput.value })
    });
    const data = await res.json();
    
    if (res.status === 200) {
        myNickname = nicknameInput.value;
        authScreen.classList.add('hidden');
        lobbyScreen.classList.remove('hidden');
        welcomeMsg.innerText = `환영합니다, ${myNickname}님!`;
        initSocket(); // 로그인 성공 시 소켓 연결
    } else {
        authMessage.innerText = data.message || "로그인 실패";
    }
});

// --- 2. 소켓 통신 및 매칭 ---

function initSocket() {
    socket = io(); // 현재 호스트로 자동 연결

    socket.on('connect', () => {
        myId = socket.id;
    });

    document.getElementById('matchBtn').addEventListener('click', () => {
        socket.emit('join_match', { nickname: myNickname });
        matchStatus.innerText = "매칭 대기 중... (상대방을 기다립니다)";
        document.getElementById('matchBtn').disabled = true;
    });

    // 매칭 성공 이벤트 (백엔드의 game.js에서 보냄)
    socket.on('match_success', (data) => {
        currentRoomId = data.roomId;
        lobbyScreen.classList.add('hidden');
        gameScreen.classList.remove('hidden');
        
        // 상대방 ID 찾기
        const p1 = data.players[0];
        const p2 = data.players[1];
        // 백엔드에서 socket.id도 같이 넘겨주면 좋지만, 현재는 없으므로 간단히 초기화
        // 편의상 양쪽을 초기 위치로 세팅
        me.hp = 100; enemy.hp = 100;
        
        startGameLoop();
    });

    // 상대방 이동 수신
    socket.on('enemy_move', (data) => {
        enemyId = data.playerId;
        enemy.x = data.x;
        enemy.y = data.y;
        enemy.dir = data.direction;
    });

    // 상대방 액션 수신
    socket.on('enemy_action', (data) => {
        if (data.actionType === 'DASH') {
            enemy.isDashing = true;
            setTimeout(() => enemy.isDashing = false, 200);
        } else if (data.actionType === 'GUN') {
            shootGun(enemy, data.direction, data.playerId);
        } else if (data.actionType === 'SWORD') {
            swingSword(enemy, data.direction, data.playerId);
        }
    });

    // 체력 업데이트
    socket.on('update_hp', (data) => {
        if (data.targetId === myId) {
            me.hp -= data.damage;
            myHpBar.innerText = `내 HP: ${me.hp}`;
            if (me.hp <= 0) {
                socket.emit('game_over', { roomId: currentRoomId, loserId: myId });
            }
        } else {
            enemy.hp -= data.damage;
            enemyHpBar.innerText = `적 HP: ${enemy.hp}`;
        }
    });

    // 게임 종료 및 승패 전적 기록
    socket.on('match_result', async (data) => {
        const isWinner = data.loserId !== myId;
        alert(isWinner ? "승리했습니다!" : "패배했습니다...");
        
        // 백엔드 PATCH API 호출하여 전적 기록 (1: 승리, -1: 패배)
        await fetch(`/api/users/${isWinner ? 1 : -1}`, {
            method: 'PATCH'
        });

        // 로비로 돌아가기
        window.location.reload();
    });
}

// --- 3. 게임 엔진 (조작 및 렌더링) ---

window.addEventListener('keydown', (e) => keys[e.code] = true);
window.addEventListener('keyup', (e) => keys[e.code] = false);

// 액션 키 (한 번 누를 때 한 번만 발동되도록 keydown 이벤트 사용)
window.addEventListener('keydown', (e) => {
    if (gameScreen.classList.contains('hidden')) return;

    if (e.code === 'KeyC') { // 대시
        me.isDashing = true;
        me.x += (me.dir === 'left' ? -100 : 100); 
        socket.emit('player_action', { roomId: currentRoomId, actionType: 'DASH', x: me.x, y: me.y, direction: me.dir });
        setTimeout(() => me.isDashing = false, 200);
    }
    if (e.code === 'KeyX') { // 총
        shootGun(me, me.dir, myId);
        socket.emit('player_action', { roomId: currentRoomId, actionType: 'GUN', x: me.x, y: me.y, direction: me.dir });
    }
    if (e.code === 'KeyZ') { // 칼
        swingSword(me, me.dir, myId);
        socket.emit('player_action', { roomId: currentRoomId, actionType: 'SWORD', x: me.x, y: me.y, direction: me.dir });
    }
});

function shootGun(player, dir, ownerId) {
    bullets.push({
        x: player.x + 15, y: player.y + 15,
        dx: dir === 'left' ? -10 : 10, dy: 0,
        owner: ownerId
    });
}

function swingSword(player, dir, ownerId) {
    swords.push({
        x: dir === 'left' ? player.x - 40 : player.x + player.width,
        y: player.y - 10,
        width: 40, height: 50,
        owner: ownerId, timer: 10 // 프레임 타이머
    });
}

// 메인 게임 루프
function startGameLoop() {
    function update() {
        // 이동 로직
        let moved = false;
        const speed = 4;
        
        if (keys['ArrowUp']) { me.y -= speed; moved = true; }
        if (keys['ArrowDown']) { me.y += speed; moved = true; }
        if (keys['ArrowLeft']) { me.x -= speed; me.dir = 'left'; moved = true; }
        if (keys['ArrowRight']) { me.x += speed; me.dir = 'right'; moved = true; }

        // 화면 밖으로 나가지 못하게 방지
        me.x = Math.max(0, Math.min(canvas.width - me.width, me.x));
        me.y = Math.max(0, Math.min(canvas.height - me.height, me.y));

        // 서버로 내 위치 전송 (움직였을 때만)
        if (moved) {
            socket.emit('player_move', { roomId: currentRoomId, x: me.x, y: me.y, direction: me.dir });
        }

        // 총알 업데이트 및 충돌 판정
        for (let i = bullets.length - 1; i >= 0; i--) {
            let b = bullets[i];
            b.x += b.dx;
            
            // 내가 쏜 총알이 적에게 맞았는지 (타격 판정은 공격자가 서버에 알림)
            if (b.owner === myId && 
                b.x > enemy.x && b.x < enemy.x + enemy.width &&
                b.y > enemy.y && b.y < enemy.y + enemy.height) {
                
                socket.emit('player_hit', { roomId: currentRoomId, targetId: enemyId, damage: 10 });
                bullets.splice(i, 1);
                continue;
            }
            // 화면 밖 총알 삭제
            if (b.x < 0 || b.x > canvas.width) bullets.splice(i, 1);
        }

        // 칼 업데이트 및 충돌 판정
        for (let i = swords.length - 1; i >= 0; i--) {
            let s = swords[i];
            s.timer--;
            
            if (s.owner === myId && s.timer === 8) { // 한번만 판정하기 위해 타이머 이용
                if (s.x < enemy.x + enemy.width && s.x + s.width > enemy.x &&
                    s.y < enemy.y + enemy.height && s.y + s.height > enemy.y) {
                    socket.emit('player_hit', { roomId: currentRoomId, targetId: enemyId, damage: 20 });
                }
            }
            if (s.timer <= 0) swords.splice(i, 1);
        }
    }

    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // 플레이어 렌더링
        ctx.fillStyle = me.isDashing ? 'cyan' : me.color;
        ctx.fillRect(me.x, me.y, me.width, me.height);
        
        // 상대방 렌더링
        ctx.fillStyle = enemy.isDashing ? 'pink' : enemy.color;
        ctx.fillRect(enemy.x, enemy.y, enemy.width, enemy.height);

        // 시선 방향 표시(작은 사각형)
        ctx.fillStyle = 'black';
        ctx.fillRect(me.dir === 'right' ? me.x + 25 : me.x - 5, me.y + 10, 10, 10);
        ctx.fillRect(enemy.dir === 'right' ? enemy.x + 25 : enemy.x - 5, enemy.y + 10, 10, 10);

        // 총알 렌더링
        ctx.fillStyle = 'yellow';
        bullets.forEach(b => {
            ctx.beginPath();
            ctx.arc(b.x, b.y, 4, 0, Math.PI * 2);
            ctx.fill();
        });

        // 칼 렌더링 (반투명 이펙트)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        swords.forEach(s => {
            ctx.fillRect(s.x, s.y, s.width, s.height);
        });
    }

    function loop() {
        update();
        draw();
        if(me.hp > 0 && enemy.hp > 0) {
            requestAnimationFrame(loop);
        }
    }
    
    loop();
}