export function resMsg(message, statusCode=200){
    return res.status(statusCode).json({message:message})
}