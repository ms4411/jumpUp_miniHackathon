import { Server } from "socket.io";
// 필요하다면 jwt 인증 로직을 불러와 소켓 연결 시 확인할 수 있습니다.

// 매칭을 기다리는 유저들을 담아둘 배열
let waitingQueue = [];
// 현재 진행 중인 게임 방 정보
const activeRooms = {}; 

export default function setupSocket(server) {
    // HTTP 서버에 Socket.io를 연결
    const io = new Server(server, {
        cors: {
            origin: "*", // 프론트엔드 주소에 맞게 수정하세요 (예: "http://localhost:3000")
            methods: ["GET", "POST"]
        }
    });

    io.on("connection", (socket) => {
        console.log(`🟢 유저 접속됨: ${socket.id}`);

        // ------------------------------------
        // 1. 매칭 시스템
        // ------------------------------------
        socket.on("join_match", (userData) => {
            console.log(`[매칭 시도] 유저: ${userData.nickname}`);
            
            // 큐에 유저 추가
            waitingQueue.push({ socket, userData });

            // 대기 인원이 2명 이상이면 매칭 성사
            if (waitingQueue.length >= 2) {
                const player1 = waitingQueue.shift();
                const player2 = waitingQueue.shift();

                const roomId = `room_${player1.socket.id}_${player2.socket.id}`;

                // 두 유저를 같은 소켓 룸으로 조인
                player1.socket.join(roomId);
                player2.socket.join(roomId);

                // 방 정보 저장
                activeRooms[roomId] = {
                    players: [player1.socket.id, player2.socket.id],
                    status: "PLAYING"
                };

                // 두 유저에게 매칭 성공 알림
                io.to(roomId).emit("match_success", {
                    roomId: roomId,
                    message: "매칭 성공! 게임을 시작합니다.",
                    players: [player1.userData, player2.userData]
                });
                
                console.log(`⚔️ 매칭 성사: 방 번호 [${roomId}]`);
            }
        });

        // ------------------------------------
        // 2. 인게임 액션 동기화 (이동, 대시, 총, 칼)
        // ------------------------------------
        
        // 이동 동기화
        socket.on("player_move", (data) => {
            // data: { roomId, x, y, direction }
            // 나를 제외한 방 안의 상대방에게 내 위치 전송
            socket.to(data.roomId).emit("enemy_move", {
                playerId: socket.id,
                x: data.x,
                y: data.y,
                direction: data.direction
            });
        });

        // 공격 및 스킬 액션 (대시, 총, 칼)
        socket.on("player_action", (data) => {
            // data: { roomId, actionType: "DASH" | "GUN" | "SWORD", x, y, direction }
            socket.to(data.roomId).emit("enemy_action", {
                playerId: socket.id,
                actionType: data.actionType,
                x: data.x,
                y: data.y,
                direction: data.direction
            });
        });

        // 체력 감소 및 데미지 판정 (클라이언트에서 맞았다고 서버로 보낼 때)
        socket.on("player_hit", (data) => {
            // data: { roomId, targetId, damage }
            io.to(data.roomId).emit("update_hp", {
                targetId: data.targetId,
                damage: data.damage
            });
        });

        // 게임 종료 (누군가 죽었을 때 승패 판정)
        socket.on("game_over", (data) => {
            // data: { roomId, loserId }
            io.to(data.roomId).emit("match_result", {
                loserId: data.loserId,
                message: "게임 종료!"
            });
            // 이후 클라이언트 측에서 user.js의 patch API('/api/users/1' 등)를 호출하여 전적을 DB에 저장하면 됩니다.
        });

        // ------------------------------------
        // 3. 연결 해제 처리
        // ------------------------------------
        socket.on("disconnect", () => {
            console.log(`🔴 유저 접속 끊김: ${socket.id}`);
            
            // 대기열에 있던 유저라면 큐에서 제거
            waitingQueue = waitingQueue.filter(p => p.socket.id !== socket.id);

            // 게임 중에 나간 경우 처리 로직 (상대방 기권승 처리 등)
            // 여기서는 단순성을 위해 생략
        });
    });
}