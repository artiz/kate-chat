import logging
import sys
import random
import json
from uuid import UUID
from app.core.config import settings
from aiologger.loggers.json import JsonLogger
from aiologger import Logger
from aiologger.formatters.base import Formatter
from aiologger.utils import CallableWrapper
from datetime import datetime, timezone

rnd = random.SystemRandom()


class JsonFormatter(logging.Formatter):
    """
    Custom JSON formatter for logging
    """

    def format(self, record):
        log_entry = {
            "timestamp": datetime.fromtimestamp(
                record.created, tz=timezone.utc
            ).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "process": record.process,
            "thread": record.thread,
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno,
        }

        # Add exception info if present
        if record.exc_info:
            log_entry["exception"] = self.formatException(record.exc_info)

        # Add extra fields from record
        for key, value in record.__dict__.items():
            if key not in [
                "name",
                "msg",
                "args",
                "levelname",
                "levelno",
                "pathname",
                "filename",
                "module",
                "exc_info",
                "exc_text",
                "stack_info",
                "lineno",
                "funcName",
                "created",
                "msecs",
                "relativeCreated",
                "thread",
                "threadName",
                "processName",
                "process",
                "message",
            ]:
                log_entry[key] = value

        return json.dumps(log_entry, ensure_ascii=False)


def uuid4_fast():
    return UUID(int=rnd.getrandbits(k=128), version=4)


def utc_now() -> int:
    return int(datetime.now(timezone.utc).timestamp()) * 1000


#######################################
# async implementation
# def init_logger(name: str = "app"):
#     if settings.environment == "production":
#         log = JsonLogger.with_default_handlers(name=name, flatten=True, level=settings.log_level)
#     else:
#         fmt = Formatter("%(levelname)-9s [%(name)s] %(message)s")
#         log = Logger.with_default_handlers(name=name, level=settings.log_level, formatter=fmt)

#     log.wrapper = CallableWrapper
#     return log


def init_logger(name: str = "app"):
    l = logging.getLogger(name)
    l.setLevel(settings.log_level)
    l.handlers.clear()
    l.propagate = False
    handler = logging.StreamHandler(sys.stdout)

    if settings.environment == "production":
        fmt = JsonFormatter()
    else:
        fmt = logging.Formatter(
            "[%(process)d-%(thread)s] [%(asctime)s.%(msecs)d] %(levelname)-7s (%(name)-24s) %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )

    handler.setFormatter(fmt)
    l.addHandler(handler)
    return l
