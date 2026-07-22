export function resMsg(res, message, statusCode=200){
    return res.status(statusCode).json({message:message})
}