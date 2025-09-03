import { errorResponse } from "../utils/responses.js";

export const assignHTTPError = (error, req, res, next) => {
    
    if (error.name === "ValidationError") {
        error.status = 422;
        error.name = "validationError";
        error.message = Object.values(error.errors).map(err => {
            return `${err.value} cannot be used for ${err.path}`;
        }).join(', ');
    }
    
    if (error.name === "MongoError" && error.code === 11000) {
        error.status = 409;
        error.name = "DuplicateKeyError";
        error.message = `Duplicate key error: ${Object.keys(error.keyValue).join(', ')} already exists.`;
    }
    
    if (!error.status) {
        error.status = 500;
    }

    if (!error.name) {
        error.name = "Internal Server Error";
    }
    
    error.message = error.message || "An Error occurred while executing information.";

    console.log("error: ", error);
    next(error);
}

// Error handling Middleware function for logging the error message
// const errorLogger = (error, req, res, next) => {
//     let errorStatus= error.status;
//     let errorName = error.name;
//     let functionReference = error.stack.split(/\n[\s\t]*/)[1].slice(3);
//     let requestPath = req.originalUrl
//     let requestMethod = req.method
//     let message = error.message
//     let ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress
    
//     errLogger.error(message, {
//         errorStatus,
//         errorName,
//         functionReference,
//         requestPath,
//         requestMethod,
//         ip
//     })

//     next(error) // calling next middleware
// }
  
// Error handling Middleware function reads the error message 
// and sends back a response in JSON format
export const errorResponder = (error, req, res, next) => {
    res.header("Content-Type", 'application/json')
    const status = error.status
    res.status(status||500).send(errorResponse(error));
}

// Fallback Middleware function for returning 
// 404 error for undefined paths
export const invalidPathHandler = (req, res) => {
    res.status(404)
    res.send(errorResponse('Invalid path, There is no route with the given path.'))
}