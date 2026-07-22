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

// 게임 상태// 기존 코드에 isHit: false 를 추가합니다.
let me = { x: 100, y: 300, width: 30, height: 30, color: '#3498db', hp: 100, dir: 'right', isDashing: false, isHit: false };
let enemy = { x: 600, y: 300, width: 30, height: 30, color: '#e74c3c', hp: 100, dir: 'left', isDashing: false, isHit: false };
let bullets = []; // 총알 배열 {x, y, dx, dy, owner}
let swords = [];  // 칼 공격 배열 {x, y, owner, timer}
let keys = {};    // 눌린 키 상태

// --- 1. 인증 및 API (로그인/회원가입) ---

document.getElementById('registerBtn').addEventListener('click', async () => {
    // 1. 입력된 값에서 양옆 공백 제거
    const nickname = nicknameInput.value.trim();
    const password = passwordInput.value.trim();

    // 2. 빈 값 검사
    if (!nickname || !password) {
        authMessage.innerText = "닉네임과 비밀번호를 모두 입력해주세요.";
        return; // 값이 비어있으면 함수를 여기서 즉시 종료 (서버로 요청 안 보냄)
    }

    // 3. 정상적으로 값이 있을 때만 서버로 요청
    const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: nickname, password: password })
    });
    
    const data = await res.json();
    authMessage.innerText = data.message;
});

document.getElementById('loginBtn').addEventListener('click', async () => {
    // 1. 입력된 값에서 양옆 공백 제거
    const nickname = nicknameInput.value.trim();
    const password = passwordInput.value.trim();

    // 2. 빈 값 검사
    if (!nickname || !password) {
        authMessage.innerText = "닉네임과 비밀번호를 모두 입력해주세요.";
        return; // 값이 비어있으면 함수를 여기서 즉시 종료 (서버로 요청 안 보냄)
    }

    // 3. 정상적으로 값이 있을 때만 서버로 요청
    const res = await fetch('/api/users/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: nickname, password: password })
    });
    const data = await res.json();
    
    if (res.status === 200) {
        myNickname = nickname; // 공백이 제거된 깔끔한 닉네임 사용
        authScreen.classList.add('hidden');
        lobbyScreen.classList.remove('hidden');
        welcomeMsg.innerText = `환영합니다, ${myNickname}님!`;
        initSocket(); // 로그인 성공 시 소켓 연결
    } else {
        authMessage.innerText = data.message || "로그인 실패";
    }
});

// 전적을 업데이트하고 화면을 로비로 돌려보내는 함수
function handleGameOver(result) {
    // 1. 서버에 전적 업데이트 요청
    fetch(`/api/users/${result}`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json'
        },
        credentials: 'include' 
    })
    .then(res => res.json())
    .then(data => {
        console.log('전적 업데이트 완료:', data);
        alert(result === 1 ? '승리했습니다!' : '패배했습니다...');

        // 2. 화면 전환 (게임 화면 숨기고 로비 화면 띄우기)
        gameScreen.classList.add('hidden');
        lobbyScreen.classList.remove('hidden');

        // 3. ⭐️ 다음 게임을 위해 캐릭터 상태 완전 초기화 ⭐️
        me.hp = 100;
        enemy.hp = 100;
        me.x = 100;  // 내 원래 시작 위치
        enemy.x = 600; // 적 원래 시작 위치
        bullets = []; // 날아가던 총알도 싹 지워주기
        swords = [];
    })
    .catch(err => {
        console.error('전적 업데이트 에러:', err);
    });
}
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
    socket.on("update_hp", (data) => {
        if (data.targetId === myId) {
            me.hp -= data.damage;
            myHpBar.innerText = `내 HP: ${me.hp}`;
            
            // 🌟 내 캐릭터 피격 이펙트 발동
            me.isHit = true;
            setTimeout(() => { me.isHit = false; }, 150); // 0.15초 뒤 원래 색으로

        } else if (data.targetId === enemyId) {
            enemy.hp -= data.damage;
            enemyHpBar.innerText = `적 HP: ${enemy.hp}`;
            
            // 🌟 적 캐릭터 피격 이펙트 발동
            enemy.isHit = true;
            setTimeout(() => { enemy.isHit = false; }, 150); // 0.15초 뒤 원래 색으로
        }
    });

    // 게임 종료 및 승패 전적 기록
    socket.on('match_result', async (data) => { 
        const result = (data.loserId === socket.id) ? -1 : 1;
    
        // 위에서 만든 함수 실행!
        handleGameOver(result);
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
        setTimeout(() => me.isDashing = false, 500);
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
        
        if (keys['KeyW']) { me.y -= speed; moved = true; }
        if (keys['KeyS']) { me.y += speed; moved = true; }
        if (keys['KeyA']) { me.x -= speed; me.dir = 'left'; moved = true; }
        if (keys['KeyD']) { me.x += speed; me.dir = 'right'; moved = true; }

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
        ctx.fillStyle = me.isHit ? 'white' : me.color;
        ctx.fillStyle = me.isDashing ? 'cyan' : me.color;
        ctx.fillRect(me.x, me.y, me.width, me.height);
        
        // 상대방 렌더링
        ctx.fillStyle = enemy.isHit ? 'white' : enemy.color;
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
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
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

// --- 0. 자동 로그인 (페이지 로드 시 실행) ---
window.addEventListener('DOMContentLoaded', async () => {
    try {
        // 백엔드에 쿠키(토큰)를 보내서 로그인 상태인지 확인
        const res = await fetch('/api/users/me');
        
        if (res.status === 200) {
            const data = await res.json();
            myNickname = data.nickname;
            
            // 로그인 화면 숨기고 대기실 화면 표시
            authScreen.classList.add('hidden');
            lobbyScreen.classList.remove('hidden');
            welcomeMsg.innerText = `환영합니다, ${myNickname}님! (자동 로그인)`;
            
            // 소켓 연결
            initSocket(); 
        }
        // 200이 아니라면(토큰이 없거나 만료됨) 아무것도 하지 않음 -> 자연스럽게 로그인 창이 유지됨
    } catch (error) {
        console.error("자동 로그인 체크 중 에러 발생:", error);
    }
});