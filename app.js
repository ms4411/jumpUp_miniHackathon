import express from "express"
import morgan from "morgan"
import cookieParser from 'cookie-parser';
import userRouter from "./route/user.js"
import cors from "cors"

// 웹소켓 연결을 위한 내장 http 모듈 불러오기
import { createServer } from "http"; 
import setupSocket from "./webSoket/game.js"; // 방금 만든 game.js 불러오기

const app=express()
const PORT=3001

const httpServer = createServer(app);

app.use(cookieParser());
app.use(express.static("public"))
app.use(morgan("dev"))
app.use(express.json());
app.use(cors())

app.use("/api/users", userRouter)

// 웹소켓 서버 실행
setupSocket(httpServer);

// app.listen 대신 httpServer.listen을 사용해야 소켓과 Express가 함께 돌아갑니다.
httpServer.listen(PORT, () => {
    console.log(`서버와 웹소켓이 http://localhost:${PORT} 에서 실행 중입니다.`);
});