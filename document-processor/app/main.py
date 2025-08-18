from fastapi.concurrency import asynccontextmanager
import uvicorn
import asyncio
from fastapi import FastAPI, Depends, Request, WebSocket, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exception_handlers import http_exception_handler
from starlette.responses import JSONResponse

from app.core.config import settings
from app.core import global_app, util
from app.services.sqs_service import SQSService


@asynccontextmanager
async def lifespan(app: FastAPI):
    await app_startup()
    yield
    await app_shutdown()

app = FastAPI(
    title=settings.project_name,
    version=settings.version,
    lifespan=lifespan,
    debug=True
)

log = util.init_logger("app")

# Global SQS service instance
sqs_service = None
startup_task = None

async def app_startup():
    global sqs_service, startup_task
    log.info("app startup...")
    
    startup_task = asyncio.ensure_future(global_app.startup())
    
    # Setup SQS listener
    sqs_service = SQSService()
    log.info(f"SQS listener starting...")
    await sqs_service.startup()
    

async def app_shutdown():
    global sqs_service, startup_task
    log.info("app shutdown...")
    startup_task.cancel()
    
    # Disconnect SQS listener
    await sqs_service.shutdown()

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    log.exception(exc)
    if isinstance(exc, HTTPException):
        return await http_exception_handler(request, exc)
    return JSONResponse({"error": str(exc)}, status_code=status.HTTP_500_INTERNAL_SERVER_ERROR)

@app.get("/")
async def root():
    return {"app": settings.project_name, "version": settings.version}

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        log_level="critical",
        reload=True,
        port=settings.port,
        workers=settings.workers,
    )
