import { Router } from "express";
import 'dotenv/config';
import bcrypt from 'bcrypt';
import { resMsg } from "../common/response.js";
import jwt from 'jsonwebtoken';

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const route=Router()
const saltRounds = 10;

const status = Object.freeze({
    MATCHING: "MATCHING",
    WAIT: "WAIT",
    PLAY: "PLAY"
});

route.post("/", async (req, res) => {
    try {
        // 1. 이미 존재하는 닉네임인지 먼저 검사
        const existingUser = await prisma.user.findUnique({
            where: { nickname: req.body.nickname }
        });

        // 2. 이미 존재한다면 가입 차단 및 클라이언트에 메시지 전달
        if (existingUser) {
            // 커스텀 응답 함수인 resMsg를 사용하거나, 직접 상태 코드와 메시지를 리턴
            return res.status(409).json({ message: "이미 사용 중인 닉네임입니다." }); 
        }

        // 3. 존재하지 않으면 정상적으로 가입 진행
        const newUser = await prisma.user.create({
            data: {
                nickname: req.body.nickname,
                password: await bcrypt.hash(req.body.password, saltRounds)
            }
        });
        
        return resMsg(res, "회원가입이 성공하였습니다", 201);

    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "회원가입 중 서버 에러가 발생했습니다." });
    }
});

route.post("/login",async (req,res)=>{
    const user = await prisma.user.findUnique({
        where: {nickname:req.body.nickname}
    })
    //로그인 실패 처리
    if(!user){ 
        return resMsg(res, "비밀번호 또는 닉네임이 틀렸습니다.", 400) 
    }
    if(!await bcrypt.compare(req.body.password, user.password)){
        return resMsg(res, "비밀번호 또는 닉네임이 틀렸습니다.", 400)
    }

    //jwt생성
    const payload = {
        userId: user.id,
    };
    const SECRET_KEY = process.env.SECRET_KEY;
    const options = {
        expiresIn: '1d', // 토큰 유효 기간 (1h, 1d, 7d, 30m 등)
    };
    const token = jwt.sign(payload, SECRET_KEY, options);

    //쿠키 발급
    res.cookie('authToken', token, {
        httpOnly: true, // 자바스크립트(document.cookie) 접근 차단 (XSS 방지)
        secure: process.env.NODE_ENV === 'production', // HTTPS 환경에서만 전송 (운영 환경 추천)
        sameSite: 'strict', // CSRF 공격 방지 ('lax' 또는 'strict' 추천)
        maxAge: 1000 * 60 * 60 * 24, // 쿠키 유효 기간 (밀리초 단위, 예: 1일)
        // path: '/' // 모든 경로에서 쿠키 유효 (기본값)
    });
    return resMsg(res, "로그인에 성공하였습니다")
})


// --- 자동 로그인을 위한 내 정보 확인 API ---
route.get("/me", async (req, res) => {
    try {
        const token = req.cookies.authToken;
        
        // 토큰이 없으면 401(Unauthorized) 반환
        if (!token) {
            return res.status(401).json({ message: "로그인 상태가 아닙니다." });
        }

        // 토큰 검증 및 유저 ID 추출
        const decoded = jwt.verify(token, process.env.SECRET_KEY);
        
        // DB에서 해당 유저 찾기
        const user = await prisma.user.findUnique({
            where: { id: Number(decoded.userId) }
        });

        if (!user) {
            return res.status(401).json({ message: "유저를 찾을 수 없습니다." });
        }

        // 유효한 유저라면 닉네임을 클라이언트로 전달
        return res.status(200).json({ nickname: user.nickname });

    } catch (error) {
        // 토큰 만료 또는 변조 시
        return res.status(401).json({ message: "유효하지 않은 토큰입니다." });
    }
});


route.get("/:status", async (req, res)=>{
    const users = await prisma.user.findMany({
            where: {status:req.params.status}
        })
        return res.json({users:users, length: users.length})
    })

route.patch("/:result", async (req, res) => {
    try {
        const token = req.cookies.authToken;
        if (!token) {
        return res.status(401).json({ message: '인증 토큰이 없습니다.' });
        }

        const decoded = jwt.verify(token, process.env.SECRET_KEY);
        const userId = decoded.userId;

        // 클라이언트에게 -1 또는 1 수치를 숫자로 받음 (예: { result: 1 })
        const result = Number(req.params.result); // 또는 req.params.result

        // 1. 조건에 따라 update에 넣을 data 객체 구성
        let updateData = {};

        if (result === 1) {
        // 1인 경우 cntWin 1 증가
        updateData = {
            cntWin: { increment: 1 }
        };
        } else if (result === -1) {
        // -1인 경우 cntLose 1 증가
        updateData = {
            cntLose: { increment: 1 }
        };
        } else {
        return res.status(400).json({ message: '유효하지 않은 결과 값입니다. (-1 또는 1만 가능)' });
        }

        // 2. DB 업데이트 실행
        const updatedUser = await prisma.user.update({
        where: {
            id: Number(userId),
        },
        data: updateData,
        });

        return res.status(200).json({
        message: '승패 기록이 성공적으로 업데이트되었습니다.',
        user: updatedUser,
        });

    } catch (error) {
        console.error(error);
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
        return res.status(403).json({ message: '유효하지 않거나 만료된 토큰입니다.' });
        }
        return res.status(500).json({ message: '서버 에러가 발생했습니다.' });
    }
});

export default route