// --- DOM 요소 ---
const authScreen = document.getElementById('authScreen');
const lobbyScreen = document.getElementById('lobbyScreen');
const gameScreen = document.getElementById('gameScreen');

const nicknameInput = document.getElementById('nickname');
const passwordInput = document.getElementById('password');
const authMessage = document.getElementById('authMessage');
const welcomeMsg = document.getElementById('welcomeMsg');
const matchStatus = document.getElementById('matchStatus');
const matchBtn = document.getElementById('matchBtn');
const recordMsg = document.getElementById('recordMsg');
const resultRecord = document.getElementById('resultRecord');

const myHpBar = document.getElementById('myHpBar');
const enemyHpBar = document.getElementById('enemyHpBar');
const myHpFill = document.getElementById('myHpFill');
const enemyHpFill = document.getElementById('enemyHpFill');

const resultOverlay = document.getElementById('resultOverlay');
const resultText = document.getElementById('resultText');
const resultConfirmBtn = document.getElementById('resultConfirmBtn');

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- 상태 변수 ---
let socket = null;
let myNickname = '';
let currentRoomId = '';
let myId = '';
let enemyId = '';

// 게임 상태
let me = { x: 100, y: 300, width: 30, height: 30, color: '#3498db', hp: 100, dir: 'right', isDashing: false, isHit: false };
let enemy = { x: 600, y: 300, width: 30, height: 30, color: '#e74c3c', hp: 100, dir: 'left', isDashing: false, isHit: false };
let bullets = []; // 총알 배열 {x, y, dx, dy, owner, color}
let swords = [];  // 칼 공격 배열 {x, y, owner, timer, dir, color}
let keys = {};    // 눌린 키 상태
let gameEnded = false; // 게임 종료 알림 중복 전송 방지 플래그

// --- 이펙트 상태 ---
let particles = [];    // 피격 파티클 {x,y,vx,vy,life,maxLife,color,size}
let damageNumbers = []; // 데미지 숫자 {x,y,vy,life,maxLife,text,color}
let dashTrails = [];    // 대시 잔상 {x,y,width,height,life,maxLife,color}
let shakeTime = 0;
let shakeMag = 0;

// --- 1. 인증 및 API (로그인/회원가입) ---

document.getElementById('registerBtn').addEventListener('click', async () => {
    const nickname = nicknameInput.value.trim();
    const password = passwordInput.value.trim();

    if (!nickname || !password) {
        authMessage.innerText = "닉네임과 비밀번호를 모두 입력해주세요.";
        return;
    }

    const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: nickname, password: password })
    });

    const data = await res.json();
    authMessage.innerText = data.message;
});

document.getElementById('loginBtn').addEventListener('click', async () => {
    const nickname = nicknameInput.value.trim();
    const password = passwordInput.value.trim();

    if (!nickname || !password) {
        authMessage.innerText = "닉네임과 비밀번호를 모두 입력해주세요.";
        return;
    }

    const res = await fetch('/api/users/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: nickname, password: password })
    });
    const data = await res.json();

    if (res.status === 200) {
        myNickname = nickname;
        authScreen.classList.add('hidden');
        lobbyScreen.classList.remove('hidden');
        welcomeMsg.innerText = `환영합니다, ${myNickname}님!`;
        loadRecord();
        initSocket();
    } else {
        authMessage.innerText = data.message || "로그인 실패";
    }
});

// --- 전적(승/패) UI 헬퍼 ---

function renderRecord(win, lose) {
    const w = Number(win) || 0;
    const l = Number(lose) || 0;
    const html = `<span class="win-count">${w}승</span><span class="lose-count">${l}패</span>`;
    if (recordMsg) recordMsg.innerHTML = html;
    if (resultRecord) resultRecord.innerHTML = html;
}

// 로그인 직후 등, 서버에서 최신 전적만 다시 받아와 표시할 때 사용
async function loadRecord() {
    try {
        const res = await fetch('/api/users/me');
        if (res.status === 200) {
            const data = await res.json();
            renderRecord(data.cntWin, data.cntLose);
        }
    } catch (error) {
        console.error("전적 조회 중 에러 발생:", error);
    }
}

// --- HP UI 헬퍼 ---

function updateHpFill(fillEl, hp) {
    const pct = Math.max(0, hp);
    fillEl.style.width = pct + '%';
    if (hp > 0 && hp <= 30) {
        fillEl.classList.add('low');
    } else {
        fillEl.classList.remove('low');
    }
}

function setHit(entity, fillEl) {
    entity.isHit = true;
    fillEl.classList.add('flash');
    setTimeout(() => {
        entity.isHit = false;
        fillEl.classList.remove('flash');
    }, 150);
}

function resetHpUI() {
    updateHpFill(myHpFill, 100);
    updateHpFill(enemyHpFill, 100);
    myHpBar.innerText = '100';
    enemyHpBar.innerText = '100';
}

// --- 이펙트 헬퍼 ---

function hexToRgba(hex, alpha) {
    const h = hex.replace('#', '');
    const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
    const bigint = parseInt(full, 16);
    const r = (bigint >> 16) & 255, g = (bigint >> 8) & 255, b = bigint & 255;
    return `rgba(${r},${g},${b},${alpha})`;
}

function spawnParticles(x, y, color, count = 14, speed = 4) {
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const spd = speed * (0.4 + Math.random() * 0.6);
        particles.push({
            x, y,
            vx: Math.cos(angle) * spd,
            vy: Math.sin(angle) * spd,
            life: 20 + Math.random() * 10,
            maxLife: 30,
            color,
            size: 2 + Math.random() * 2
        });
    }
}

function spawnDamageNumber(x, y, value, color) {
    damageNumbers.push({ x, y, vy: -1.2, life: 45, maxLife: 45, text: `-${value}`, color });
}

function spawnShake(mag, duration) {
    shakeMag = Math.max(shakeMag, mag);
    shakeTime = Math.max(shakeTime, duration);
}

function spawnDashGhost(x, y, width, height, color) {
    dashTrails.push({ x, y, width, height, life: 14, maxLife: 14, color });
}

// 전적을 업데이트하고 결과 화면을 띄우는 함수
function handleGameOver(result) {
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
        if (data.user) {
            renderRecord(data.user.cntWin, data.user.cntLose);
        }
        showResultOverlay(result);
    })
    .catch(err => {
        console.error('전적 업데이트 에러:', err);
        showResultOverlay(result); // 전적 저장에 실패해도 결과 화면은 보여준다
    });
}

function showResultOverlay(result) {
    const isWin = result === 1;
    resultText.textContent = isWin ? 'VICTORY' : 'DEFEAT';
    resultOverlay.classList.remove('hidden', 'win', 'lose');
    resultOverlay.classList.add(isWin ? 'win' : 'lose');
}

// 결과 화면 확인 버튼 -> 로비로 복귀 + 다음 게임을 위한 완전 초기화
resultConfirmBtn.addEventListener('click', () => {
    resultOverlay.classList.add('hidden');
    gameScreen.classList.add('hidden');
    lobbyScreen.classList.remove('hidden');

    me.hp = 100; enemy.hp = 100;
    me.x = 100; enemy.x = 600;
    bullets = [];
    swords = [];
    particles = [];
    damageNumbers = [];
    dashTrails = [];
    shakeTime = 0;
    shakeMag = 0;
    gameEnded = false;

    resetHpUI();
    matchStatus.innerText = '';
    matchBtn.disabled = false;
});

// --- 2. 소켓 통신 및 매칭 ---

function initSocket() {
    socket = io(); // 현재 호스트로 자동 연결

    socket.on('connect', () => {
        myId = socket.id;
    });

    matchBtn.addEventListener('click', () => {
        socket.emit('join_match', { nickname: myNickname });
        matchStatus.innerText = "매칭 대기 중... (상대방을 기다립니다)";
        matchBtn.disabled = true;
    });

    // 매칭 성공 이벤트 (백엔드의 game.js에서 보냄)
    socket.on('match_success', (data) => {
        currentRoomId = data.roomId;
        // ⭐️ 서버가 미리 알려주는 상대방 id. 더 이상 enemy_move를 기다릴 필요 없음
        // (상대가 움직이기 전에 공격당해도 데미지가 씹히지 않도록)
        enemyId = data.enemyId;

        lobbyScreen.classList.add('hidden');
        gameScreen.classList.remove('hidden');

        // ⭐️ isFirst 값으로 두 클라이언트가 "같은 좌표계"를 쓰도록 시작 위치를 맞춘다.
        // 이전에는 두 플레이어 모두 항상 자신을 x=100(왼쪽)으로 초기화했기 때문에,
        // 실제로는 서로 다른 물리적 위치에 있는데도 좌표가 겹쳐서
        // "내 위치가 상대 화면에서도 동일하게 찍히는" 버그가 발생했었다.
        if (data.isFirst) {
            me.x = 100; me.y = 300;
            enemy.x = 600; enemy.y = 300;
        } else {
            me.x = 600; me.y = 300;
            enemy.x = 100; enemy.y = 300;
        }

        me.hp = 100; enemy.hp = 100;
        gameEnded = false;
        resetHpUI();

        startGameLoop();
    });

    // 상대방 이동 수신 (enemyId는 이미 match_success에서 설정됨)
    socket.on('enemy_move', (data) => {
        enemy.x = data.x;
        enemy.y = data.y;
        enemy.dir = data.direction;
    });

    // 상대방 액션 수신
    socket.on('enemy_action', (data) => {
        if (data.actionType === 'DASH') {
            enemy.isDashing = true;
            spawnDashGhost(enemy.x, enemy.y, enemy.width, enemy.height, '#ff2e6d');
            setTimeout(() => enemy.isDashing = false, 500);
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
            myHpBar.innerText = `${Math.max(0, me.hp)}`;
            updateHpFill(myHpFill, me.hp);
            setHit(me, myHpFill);

            spawnParticles(me.x + me.width / 2, me.y + me.height / 2, '#ff2740', 14);
            spawnDamageNumber(me.x + me.width / 2, me.y, data.damage, '#ff2740');
            spawnShake(6, 10);

            // ⭐️ 내 HP가 0 이하가 되면 서버에 게임 종료를 알림 (패배자 = 나)
            if (me.hp <= 0 && !gameEnded) {
                gameEnded = true;
                socket.emit('game_over', { roomId: currentRoomId, loserId: myId });
            }

        } else if (data.targetId === enemyId) {
            enemy.hp -= data.damage;
            enemyHpBar.innerText = `${Math.max(0, enemy.hp)}`;
            updateHpFill(enemyHpFill, enemy.hp);
            setHit(enemy, enemyHpFill);

            spawnParticles(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, '#ffb703', 14);
            spawnDamageNumber(enemy.x + enemy.width / 2, enemy.y, data.damage, '#ffb703');
            spawnShake(3, 6);
        }
    });

    // 게임 종료 및 승패 전적 기록
    socket.on('match_result', async (data) => {
        const result = (data.loserId === socket.id) ? -1 : 1;
        console.log(result)
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
        const startX = me.x;
        me.isDashing = true;
        me.x += (me.dir === 'left' ? -100 : 100);
        me.x = Math.max(0, Math.min(canvas.width - me.width, me.x));

        // 대시 경로를 따라 잔상 생성
        for (let i = 0; i < 4; i++) {
            const t = i / 4;
            spawnDashGhost(startX + (me.x - startX) * t, me.y, me.width, me.height, '#00e5ff');
        }

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
    const isMe = player === me;
    const color = isMe ? '#00e5ff' : '#ff2e6d';
    const muzzleX = player.x + (dir === 'left' ? 0 : player.width);
    const muzzleY = player.y + 15;

    spawnParticles(muzzleX, muzzleY, color, 6, 2.5);

    bullets.push({
        x: player.x + 15, y: player.y + 15,
        dx: dir === 'left' ? -10 : 10, dy: 0,
        owner: ownerId,
        color
    });
}

function swingSword(player, dir, ownerId) {
    const isMe = player === me;
    swords.push({
        x: dir === 'left' ? player.x - 40 : player.x + player.width,
        y: player.y - 10,
        width: 40, height: 50,
        owner: ownerId, timer: 10, // 프레임 타이머
        dir,
        color: isMe ? '#00e5ff' : '#ff2e6d'
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

            if (b.owner === myId &&
                b.x > enemy.x && b.x < enemy.x + enemy.width &&
                b.y > enemy.y && b.y < enemy.y + enemy.height) {

                socket.emit('player_hit', { roomId: currentRoomId, targetId: enemyId, damage: 10 });
                bullets.splice(i, 1);
                continue;
            }
            if (b.x < 0 || b.x > canvas.width) bullets.splice(i, 1);
        }

        // 칼 업데이트 및 충돌 판정
        for (let i = swords.length - 1; i >= 0; i--) {
            let s = swords[i];
            s.timer--;

            if (s.owner === myId && s.timer === 8) {
                if (s.x < enemy.x + enemy.width && s.x + s.width > enemy.x &&
                    s.y < enemy.y + enemy.height && s.y + s.height > enemy.y) {
                    socket.emit('player_hit', { roomId: currentRoomId, targetId: enemyId, damage: 20 });
                }
            }
            if (s.timer <= 0) swords.splice(i, 1);
        }

        // 이펙트 수명 감소
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx; p.y += p.vy;
            p.vx *= 0.92; p.vy *= 0.92;
            p.life--;
            if (p.life <= 0) particles.splice(i, 1);
        }
        for (let i = damageNumbers.length - 1; i >= 0; i--) {
            const d = damageNumbers[i];
            d.y += d.vy;
            d.life--;
            if (d.life <= 0) damageNumbers.splice(i, 1);
        }
        for (let i = dashTrails.length - 1; i >= 0; i--) {
            const t = dashTrails[i];
            t.life--;
            if (t.life <= 0) dashTrails.splice(i, 1);
        }
        if (shakeTime > 0) shakeTime--;
    }

    function drawLowHpGlow(entity) {
        if (entity.hp <= 0 || entity.hp > 30) return;
        const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 120);
        ctx.save();
        ctx.shadowBlur = 14 + pulse * 10;
        ctx.shadowColor = '#ff2740';
        ctx.fillStyle = 'rgba(255,39,64,0.25)';
        ctx.fillRect(entity.x - 4, entity.y - 4, entity.width + 8, entity.height + 8);
        ctx.restore();
    }

    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();

        if (shakeTime > 0) {
            const dx = (Math.random() - 0.5) * shakeMag;
            const dy = (Math.random() - 0.5) * shakeMag;
            ctx.translate(dx, dy);
        }

        // 대시 잔상
        dashTrails.forEach(t => {
            const alpha = (t.life / t.maxLife) * 0.35;
            ctx.fillStyle = hexToRgba(t.color, alpha);
            ctx.fillRect(t.x, t.y, t.width, t.height);
        });

        // 저체력 경고 glow
        drawLowHpGlow(me);
        drawLowHpGlow(enemy);

        // 플레이어 렌더링
        ctx.fillStyle = me.isDashing ? '#7cf9ff' : (me.isHit ? '#ffffff' : me.color);
        ctx.fillRect(me.x, me.y, me.width, me.height);

        // 상대방 렌더링
        ctx.fillStyle = enemy.isDashing ? '#ff9fc4' : (enemy.isHit ? '#ffffff' : enemy.color);
        ctx.fillRect(enemy.x, enemy.y, enemy.width, enemy.height);

        // 시선 방향 표시(작은 사각형)
        ctx.fillStyle = '#0a0e1a';
        ctx.fillRect(me.dir === 'right' ? me.x + 25 : me.x - 5, me.y + 10, 10, 10);
        ctx.fillRect(enemy.dir === 'right' ? enemy.x + 25 : enemy.x - 5, enemy.y + 10, 10, 10);

        // 총알 렌더링 (네온 글로우)
        bullets.forEach(b => {
            ctx.save();
            ctx.shadowBlur = 8;
            ctx.shadowColor = b.color || '#fff';
            ctx.fillStyle = b.color || '#fff';
            ctx.beginPath();
            ctx.arc(b.x, b.y, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        });

        // 칼 렌더링 (슬래시 궤적)
        swords.forEach(s => {
            const alpha = Math.max(0, s.timer / 10);
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = s.color || '#fff';
            ctx.lineWidth = 4;
            ctx.shadowBlur = 10;
            ctx.shadowColor = s.color || '#fff';
            const cx = s.x + s.width / 2;
            const cy = s.y + s.height / 2;
            ctx.beginPath();
            if (s.dir === 'left') {
                ctx.arc(cx + 20, cy, 26, Math.PI * 0.2, Math.PI * 1.1);
            } else {
                ctx.arc(cx - 20, cy, 26, -Math.PI * 0.1, Math.PI * 0.8);
            }
            ctx.stroke();
            ctx.restore();
        });

        // 히트 파티클
        particles.forEach(p => {
            ctx.save();
            ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        });

        // 데미지 숫자
        damageNumbers.forEach(d => {
            ctx.save();
            ctx.globalAlpha = Math.max(0, d.life / d.maxLife);
            ctx.fillStyle = d.color;
            ctx.font = 'bold 18px "VT323", monospace';
            ctx.textAlign = 'center';
            ctx.fillText(d.text, d.x, d.y);
            ctx.restore();
        });

        ctx.restore();
    }

    function loop() {
        update();
        draw();
        if (me.hp > 0 && enemy.hp > 0) {
            requestAnimationFrame(loop);
        }
    }

    loop();
}

// --- 0. 자동 로그인 (페이지 로드 시 실행) ---
window.addEventListener('DOMContentLoaded', async () => {
    try {
        const res = await fetch('/api/users/me');

        if (res.status === 200) {
            const data = await res.json();
            myNickname = data.nickname;

            authScreen.classList.add('hidden');
            lobbyScreen.classList.remove('hidden');
            welcomeMsg.innerText = `환영합니다, ${myNickname}님! (자동 로그인)`;
            renderRecord(data.cntWin, data.cntLose);

            initSocket();
        }
    } catch (error) {
        console.error("자동 로그인 체크 중 에러 발생:", error);
    }
});