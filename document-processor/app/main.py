import uvicorn
import asyncio
from fastapi import FastAPI, Depends, Request, WebSocket, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exception_handlers import http_exception_handler
from starlette.responses import JSONResponse

from app.core.config import settings
from app.core import util


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
)

log = util.init_logger("app")


@app.on_event("startup")
async def app_startup():
    global startup_task
    log.info("app startup...")
    # TODO: setup SQS listener
    # startup_task = asyncio.ensure_future(global_app.startup())


@app.on_event("shutdown")
async def app_shutdown():
    pass
    # TODO: disconnect SQS listener
    # startup_task.cancel()
    # asyncio.create_task(global_app.shutdown())

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    log.exception(exc)
    if isinstance(exc, HTTPException):
        return await http_exception_handler(request, exc)
    return JSONResponse({"error": str(exc)}, status_code=status.HTTP_500_INTERNAL_SERVER_ERROR)

@app.get("/")
async def root():
    return {"app": settings.PROJECT_NAME, "version": settings.VERSION}

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        log_level="critical",
        reload=True,
        port=settings.PORT,
    )
