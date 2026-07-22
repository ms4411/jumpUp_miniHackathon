import express from "express"
import morgan from "morgan"
import cookieParser from 'cookie-parser';
import userRouter from "./route/user.js"

const app=express()
const PORT=3001

app.use(cookieParser());
app.use(express.static("public"))
app.use(morgan("dev"))
app.use(express.json());
app.use(cors())

app.use("/api/users", userRouter)

app.listen(PORT, () => {
    console.log(`http://localhost:${PORT} 실행 중`);
});