export function messageResponse(message){
    return {
        success: true,
        message
    }
}

export function dataResponse(message, data){
    return {
        success: true,
        message,
        data
    }
}

export function errorResponse(error){
    let errorBody = {
        success: false,
        message: error.message || error
    }
    if(error.errors){
        errorBody.data = {errors: error.errors}
    }
    return errorBody
}