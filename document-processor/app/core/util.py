import logging
import sys
import random
from uuid import UUID
from venv import logger
from app.core.config import settings
from aiologger.loggers.json import JsonLogger
from aiologger import Logger
from aiologger.formatters.base import Formatter
from aiologger.utils import CallableWrapper
from datetime import datetime, timezone

rnd = random.SystemRandom()


def uuid4_fast():
    return UUID(int=rnd.getrandbits(k=128), version=4)


def utc_now() -> int:
    return int(datetime.now(timezone.utc).timestamp()) * 1000


# def init_logger(name: str = "app", json_format: bool = False):
#     if json_format:
#         log = JsonLogger.with_default_handlers(name=name, flatten=True, level=settings.log_level)
#     else:
#         fmt = Formatter("%(levelname)-9s [%(name)s] %(message)s")
#         log = Logger.with_default_handlers(name=name, level=settings.log_level, formatter=fmt)

#     log.wrapper = CallableWrapper
#     return log


def init_logger(name: str = "app", json_format: bool = False):
    l = logging.getLogger(name)
    l.setLevel(settings.log_level)
    l.handlers.clear()
    l.propagate = False
    handler = logging.StreamHandler(sys.stdout)
    fmt = logging.Formatter("%(levelname)-9s %(process)d %(thread)s [%(name)-24s] %(message)s")
    handler.setFormatter(fmt)
    l.addHandler(handler)
    return l
