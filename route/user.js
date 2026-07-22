import { Router } from "express";
import mysql from 'mysql2/promise';
import 'dotenv/config';
import bcrypt from 'bcrypt';
import { resMsg } from "../common/response";
import jwt from 'jsonwebtoken';

const route=Router()
const saltRounds = 20;
const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: process.env.DB_PASSWORD,
    database: 'user_jumpup'
});

route.post("/", async (req, res)=>{
    const newUser = await prisma.user.create({
        data: {
            nickname: req.body.nickname,
            password: await bcrypt.hash(req.body.password, saltRounds)
        }
    });
    return resMsg("회원가입이 성공하였습니다")
})

route.post("/login",async (req,res)=>{
    const user = await prisma.user.findUnique({
        where: {nickname:req.body.nickname}
    })
    //로그인 실패 처리
    if(!user){ 
        return resMsg("비밀번호 또는 닉네임이 틀렸습니다.", 400) 
    }
    if(!await bcrypt.compare(req.body.password, user.password)){
        return resMsg("비밀번호 또는 닉네임이 틀렸습니다.", 400)
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
    return resMsg("로그인에 성공하였습니다")
})

export default route