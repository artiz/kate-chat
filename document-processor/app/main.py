import asyncio
import os
from pathlib import Path
from fastapi.concurrency import asynccontextmanager

import uvicorn
from fastapi import FastAPI, Request, HTTPException, status
from fastapi.exception_handlers import http_exception_handler
from starlette.responses import JSONResponse
from concurrent.futures import ThreadPoolExecutor

from app.core.config import settings
from app.core import global_app, util
from app.services.sqs_service import SQSService

log = util.init_logger("app")
assets_dir = Path(__file__).parent / "assets"

log.info(f"App version: {settings.version}, commit: {settings.commit_sha}")

executor = ThreadPoolExecutor()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await app_startup()
    yield
    await app_shutdown()


app = FastAPI(
    title=settings.project_name,
    version=settings.version,
    lifespan=lifespan,
    debug=settings.environment != "production",
)

# Global SQS service instance
sqs_service = None


async def app_startup():
    global sqs_service

    try:
        loop = asyncio.get_event_loop()
        loop.set_default_executor(executor)

        log.info("Startup...")
        await global_app.startup()

        # Setup SQS listener
        sqs_service = SQSService()
        log.info(f"SQS listener starting...")
        await sqs_service.startup()
        log.info(f"app initialized")
    except Exception as e:
        log.exception(e)
        os.kill(os.getpid(), 9)


async def app_shutdown():
    log.info("Shutdown...")
    try:
        await global_app.shutdown()
        # Disconnect SQS listener
        if sqs_service:
            await sqs_service.shutdown()

        executor.shutdown(cancel_futures=True, wait=False)
    except Exception as e:
        log.exception(e)
    finally:
        # Forcefully terminate the process to ensure all threads are killed
        os.kill(os.getpid(), 9)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    log.exception(exc)
    if isinstance(exc, HTTPException):
        return await http_exception_handler(request, exc)
    return JSONResponse(
        {"error": str(exc)}, status_code=status.HTTP_500_INTERNAL_SERVER_ERROR
    )


@app.get("/")
async def root():
    return {"app": settings.project_name, "version": settings.version}


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        log_level="critical",
        reload=settings.reload,
        port=settings.port,
        workers=settings.workers,
    )
