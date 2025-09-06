from pathlib import Path
from fastapi.concurrency import asynccontextmanager
import uvicorn
from fastapi import FastAPI, Request,HTTPException, status
from fastapi.exception_handlers import http_exception_handler
from starlette.responses import JSONResponse

from app.parser import PDFParser
from app.core.config import settings
from app.core import global_app, util
from app.services.sqs_service import SQSService

assets_dir = Path(__file__).parent / "assets"

@asynccontextmanager
async def lifespan(app: FastAPI):
    await app_startup()
    yield
    await app_shutdown()


log = util.init_logger("app")
app = FastAPI(
    title=settings.project_name,
    version=settings.version,
    lifespan=lifespan,
    debug=True,
)

# Global SQS service instance
sqs_service = None

async def app_startup():
    global sqs_service
    log.info("Startup...")
    await global_app.startup()
    
    log.info(f"Load Docling models...")
    parser = PDFParser()
    parser.convert_document(assets_dir /  "dummy_report.pdf")
    
    # Setup SQS listener
    sqs_service = SQSService()
    log.info(f"SQS listener starting...")
    await sqs_service.startup()
    log.info(f"app initialized")
    

async def app_shutdown():
    global sqs_service
    log.info("Shutdown...")
    await global_app.shutdown()
    
    # Disconnect SQS listener
    if sqs_service:
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
        reload=settings.reload,
        port=settings.port,
        workers=settings.workers,
    )
